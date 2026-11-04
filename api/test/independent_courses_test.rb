# Run only against a disposable PostgreSQL database:
# RAILS_ENV=test AUTH_MODE=demo VALIDATION_MODE=probes ROUTING_MODE=rules \
# DATABASE_URL=postgres://.../codeai_courses_test bundle exec ruby test/independent_courses_test.rb
abort 'Use a disposable *_courses_test database' unless ENV.fetch('DATABASE_URL', '').end_with?('_courses_test')
ENV['RAILS_ENV'] = 'test'
ENV['AUTH_MODE'] = 'demo'
ENV['VALIDATION_MODE'] = 'probes'
ENV['ROUTING_MODE'] = 'rules'
require_relative '../config/environment'
require 'rack/mock'

$count = 0
def check(value, message)
  raise message unless value
  $count += 1
end

def request(method, path, user: 's-hithesh', data: nil, status: 200)
  env = { 'CONTENT_TYPE' => 'application/json', 'HTTP_HOST' => 'localhost', input: data && JSON.generate(data) }
  env['HTTP_X_DEMO_USER'] = user if user
  result = Rack::MockRequest.new(Rails.application).request(method, path, env)
  check(result.status == status, "#{method} #{path}: expected #{status}, received #{result.status}: #{result.body[0, 1000]}")
  result.body.empty? ? nil : JSON.parse(result.body)
end

def snapshot(id)
  s = StudentRecord.find(id)
  { topic: s.topic, stages: s.stages, diagnostic: s.diagnostic, level: s.current_level_id,
    status: s.level_status, order: s.completed_order, flags: s.flags, responses: s.last_response,
    decisions: s.decisions, validations: s.validations, practice: PracticeService.new.for_student(id) }
end

# Legacy schema fixture. This test database is deliberately isolated from the local demo.
Db.execute('DROP SCHEMA public CASCADE')
Db.execute('CREATE SCHEMA public')
Rails.root.join('db/schema.sql').read.split(/;\s*$/).map(&:strip).reject(&:empty?).each { |sql| Db.execute(sql) }
Db.execute("INSERT INTO app_setting (key, value_json) VALUES ('unit', CAST(:unit AS jsonb))", unit: Db.json('intro_python'))
Db.execute("INSERT INTO app_user (id, display_name, role) VALUES ('legacy', 'Legacy learner', 'student')")
Db.execute("INSERT INTO student_progress (student_id, topic, completed_order_json) VALUES ('legacy', 'space', '[\"l1\"]')")
Db.execute("INSERT INTO mastery_state (student_id, concept_id, current_stage) VALUES ('legacy', 'c1', 2)")
Db.execute("INSERT INTO diagnostic_result (student_id, concept_id, placed_stage) VALUES ('legacy', 'c1', 1)")
migration = Rails.root.join('db/migrations/001_independent_courses.sql').read
2.times { Db.execute(migration) }
check(Db.query("SELECT unit_id, topic, completed_order_json FROM student_progress WHERE student_id='legacy'").first ==
  { 'unit_id'=>'intro_python', 'topic'=>'space', 'completed_order_json'=>['l1'] }, 'Migration must preserve legacy course and work')
check(Db.query("SELECT unit_id, current_stage FROM mastery_state WHERE student_id='legacy'").first ==
  { 'unit_id'=>'intro_python', 'current_stage'=>2 }, 'Migration must preserve mastery')
check(Db.query("SELECT unit_id, placed_stage FROM diagnostic_result WHERE student_id='legacy'").first ==
  { 'unit_id'=>'intro_python', 'placed_stage'=>1 }, 'Migration must preserve diagnostic')

Curriculum.current_unit_id = 'digital_magazine'
DemoSeed.run!
request('GET', '/api/student/courses', user: nil, status: 401)
request('GET', '/api/student/courses', user: 't-rivera', status: 403)
request('POST', '/api/student/course', user: nil, data: {courseId:'intro_python'}, status: 401)
request('POST', '/api/student/course', user: 't-rivera', data: {courseId:'intro_python'}, status: 403)
request('POST', '/api/student/course', data: {courseId:'unavailable'}, status: 422)
request('POST', '/api/student/course', data: {courseId:'ai_generated_design'}, status: 422)
request('POST', '/api/student/course', data: {}, status: 422)
request('POST', '/api/demo/unit', data: {unit:'intro_python'}, status: 403)
catalog = request('GET', '/api/student/courses')
check(catalog.size == 3 && catalog.count { |c| c['assigned'] } == 1, 'Catalog must identify the class assignment')
check(catalog.none? { |c| c.keys.any? { |key| %w[stages score diagnostic rubric].include?(key) } }, 'Student catalog must not leak evaluation data')

state = request('POST', '/api/student/course', data: {courseId:'digital_magazine'})
check(state.dig('unit', 'id') == 'digital_magazine', 'Selecting a course must return its lesson state')
request('POST', '/api/student/topic', data: {topic:state['topics'].first}) if state['phase'] == 'topic'
answers = Curriculum.with_unit('digital_magazine') { DemoSeed.diagnostic_answers('s-hithesh', {}) }
state = request('POST', '/api/student/diagnostic', data: {answers:answers})
check(state['phase'] == 'level', 'The first course should have its own warm-up and level')
level = state.dig('level', 'id')
sub = request('POST', "/api/student/levels/#{level}/submissions", data: {response:'I want to make a useful page.', signals:{}}, status:202)
request('GET', "/api/student/submissions/#{sub['submissionId']}")
state = request('GET', '/api/student/lesson')
practice = request('POST', "/api/student/levels/#{state.dig('level','id')}/practice", status:201)
request('POST', "/api/student/practice/#{practice['id']}/answers", data: {response:'I will explain what each part does.'})
a = Curriculum.with_unit('digital_magazine') { snapshot('s-hithesh') }
check(a[:practice].size == 1 && a[:validations].any? && a[:responses].any?, 'Course A fixture must include real work, feedback, and practice')

state_b = request('POST', '/api/student/course', data: {courseId:'intro_python'})
check(state_b.dig('unit','id') == 'intro_python' && %w[topic diagnostic].include?(state_b['phase']), 'Course B must start independently')
request('GET', "/api/student/submissions/#{sub['submissionId']}", status:404)
request('POST', "/api/student/practice/#{practice['id']}/answers", data: {response:'Trying to read another course.'}, status:404)
request('POST', '/api/student/topic', data: {topic:state_b['topics'].first}) if state_b['phase'] == 'topic'
answers_b = Curriculum.with_unit('intro_python') { DemoSeed.diagnostic_answers('s-hithesh', {}) }
state_b = request('POST', '/api/student/diagnostic', data: {answers:answers_b})
check(state_b['phase'] == 'level', 'Course B must accept its own diagnostic')
b = Curriculum.with_unit('intro_python') { snapshot('s-hithesh') }
check(b[:responses].empty? && b[:practice].empty? && b[:validations].empty?, 'A new course must not inherit history or practice')

request('POST', '/api/student/course', data: {courseId:'digital_magazine'})
restored = Curriculum.with_unit('digital_magazine') { snapshot('s-hithesh') }
check(a == restored, 'Switching A -> B -> A must restore all work, diagnostics, mastery, route and practice exactly')
request('GET', "/api/student/submissions/#{sub['submissionId']}")
request('GET', "/api/student/submissions/#{sub['submissionId']}", user:'s-tanushree', status:404)
request('POST', '/api/student/course', user:'s-tanushree', data: {courseId:'intro_python'})
check(request('GET', '/api/student/lesson').dig('unit','id') == 'digital_magazine', 'A peer must not change another student’s course')

%w[intro_python digital_magazine].each do |course|
  request('POST', '/api/demo/unit', user:'t-rivera', data: {unit:course})
  klass = request('GET', '/api/teacher/class', user:'t-rivera')
  check(klass['students'].size == 7 && klass.dig('unit','id') == course, 'Course assignment must preserve the shared roster')
  trace = request('GET', '/api/teacher/students/s-hithesh', user:'t-rivera')
  check(trace['practice'].size == (course == 'digital_magazine' ? 1 : 0), 'Teacher practice trace must be scoped to the selected course')
  request('GET', '/api/teacher/insights', user:'t-rivera')
  request('GET', '/api/teacher/safety', user:'t-rivera')
  request('GET', '/api/teacher/authoring', user:'t-rivera')
end
check(Curriculum.with_unit('digital_magazine') { snapshot('s-hithesh') } == a, 'Teacher assignment must not reset student work')
check(Db.query('SELECT count(*) AS n FROM app_user').first['n'] == 8, 'Switching courses must not replace identities')
check(request('GET','/api/student/lesson').dig('unit','id') == 'digital_magazine', 'Persisted personal selection must survive teacher assignment')
check(Curriculum.with_unit('intro_python') { Parallel.run(-> { Curriculum.current.id }, -> { Curriculum.current.id }) } == %w[intro_python intro_python], 'AI worker threads must inherit the course context')
Db.execute(migration)
check(Curriculum.with_unit('digital_magazine') { snapshot('s-hithesh') } == a, 'Reapplying migrations must preserve multiple existing courses')
Rails.application.load_tasks
Rake::Task['db:seed_if_empty'].invoke
check(Curriculum.with_unit('digital_magazine') { snapshot('s-hithesh') } == a, 'First-time initialization must not seed over existing course work')
check(Thread.current[:codeai_unit].nil?, 'Request course context must not leak across requests')
puts "Passed #{$count} independent-course integration assertions."
