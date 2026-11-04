# Synthetic demo data (NFR2: no real student PII). Mirrors the frontend mock's
# seeded class so the teacher view has students in different states.
module DemoSeed
  TEACHER = { id: "t-rivera", name: "Ms. Rivera (teacher)" }.freeze
  STUDENTS = {
    "s-ava" => "Ava M.", "s-ben" => "Ben O.", "s-chloe" => "Chloe P.", "s-dev" => "Dev R.",
    "s-eli" => "Eli S.", "s-fay" => "Fay T.", "s-gus" => "Gus W.",
  }.freeze

  module_function

  def run!
    # Seeding is deterministic: rules-only routing, no Bedrock calls during a reset.
    Thread.current[:codeai_seeding] = true
    seed!
  ensure
    Thread.current[:codeai_seeding] = false
  end

  def seed!
    Db.execute("TRUNCATE practice_attempt, practice_item, filter_event, route_decision, validation_result, submission, diagnostic_result, mastery_state, student_progress, enrollment, klass, app_user, app_setting")
    cur = Curriculum.current
    insert_user(TEACHER[:id], TEACHER[:name], "teacher")
    Db.execute("INSERT INTO klass (id, teacher_id, name, bar_stage) VALUES (:id, :t, :name, :bar)",
               id: cur.klass["id"], t: TEACHER[:id], name: cur.klass["name"], bar: cur.bar)
    STUDENTS.each do |id, name|
      insert_user(id, name, "student")
      Db.execute("INSERT INTO enrollment (student_id, klass_id) VALUES (:s, :k)", s: id, k: cur.klass["id"])
    end

    svc = LessonService.new
    # Answers each student's own diagnostic so they land on `target` (concept => stage).
    place = ->(id, target) { s = StudentRecord.find(id); svc.submit_diagnostic(s, diagnostic_answers(id, target)); StudentRecord.find(id) }

    chloe = place.call("s-chloe", { "c1" => 1, "c2" => 0, "c3" => 1, "c4" => 0 })
    simulate_passes(svc, chloe, 2)

    place.call("s-dev", { "c1" => 2, "c2" => 2, "c3" => 2, "c4" => 2 })

    eli = place.call("s-eli", { "c1" => 1, "c2" => 1, "c3" => 0, "c4" => 1 })
    simulate_passes(svc, eli, 1)
    eli.add_validation!(level_code: cur.level(eli.current_level_id).code, mode: "error", model_meta: { error: "seeded fault" })
    eli.flags << "Validation service unavailable (seeded fault)."
    svc.send(:close_level, eli, eli.current_level_id, "done")
    svc.send(:enter_fallback, eli, "validation failed after retry.")
    svc.send(:advance, eli)
    eli.save!

    fay = place.call("s-fay", { "c1" => 2, "c2" => 1, "c3" => 1, "c4" => 1 })
    fay.transition_fails["c3:1"] = 3
    fay.level_status[fay.current_level_id] = { "attempts" => 1, "status" => "in-progress" }
    fay.save!

    # Gus starts where Fay does, so the two share real gaps on the Insights page.
    place.call("s-gus", { "c1" => 2, "c2" => 1, "c3" => 1, "c4" => 1 })

    # Realistic unsuccessful attempts (scored with the deterministic probes) so the
    # teacher's Insights page has stuck students and shared gaps to show.
    seed_attempt(svc, StudentRecord.find("s-gus"), "Make a list of the club events for the page.", { "timeOnTaskSec" => 180, "edits" => 2 })
    seed_attempt(svc, StudentRecord.find("s-fay"), "It looks fine I guess", { "timeOnTaskSec" => 610, "edits" => 7 })
    seed_attempt(svc, StudentRecord.find("s-chloe"), "header, events", { "timeOnTaskSec" => 70, "edits" => 1, "pastes" => 1, "pastedChars" => 14 })
  end

  # One weak submission on the student's current level, scored by the probes only.
  def seed_attempt(svc, s, text, signals)
    level_id = s.current_level_id or return
    level = Curriculum.current.level(level_id)
    probes = Engine.probe(level, s.stages, text)
    return if probes.empty? || probes.all? { |p| p[:ok] }
    sub_id = SecureRandom.uuid
    s.create_submission!(sub_id, level_id, text, { status: "done", nextAction: "revise" }, signals)
    ev = Validator.new.send(:probe_only, probes)
    s.add_validation!(level_code: level.code, mode: "adaptive", submission_id: sub_id, results: ev.results.map(&:as_json),
                      model_meta: { seeded: true })
    ev.results.reject(&:passed).each { |r| k = "#{r.concept_id}:#{r.from_stage}"; s.transition_fails[k] = s.transition_fails.fetch(k, 0) + 1 }
    st = (s.level_status[level_id] ||= { "attempts" => 0, "status" => "in-progress" })
    st["attempts"] += 1
    s.last_response[level_id] = text
    s.save!
  end

  # Answers that place the student exactly at `target`: correct up to the target stage,
  # then a wrong option (which stops the ladder).
  def diagnostic_answers(student_id, target)
    Curriculum.current.diagnostic_for(student_id).to_h do |q|
      [q.id, q.stage <= target.fetch(q.concept, 0) ? q.answer : q.options.map(&:id).find { |o| o != q.answer }]
    end
  end

  def insert_user(id, name, role)
    Db.execute("INSERT INTO app_user (id, display_name, role) VALUES (:id, :name, :role)", id: id, name: name, role: role)
  end

  # Treat the current level as passed without a real submission.
  def simulate_passes(svc, s, count)
    cur = Curriculum.current
    count.times do
      break unless s.current_level_id
      level = cur.level(s.current_level_id)
      ts = Engine.applicable_transitions(level, s.stages)
      s.add_validation!(level_code: level.code, mode: "adaptive", results: ts.map do |t|
        { conceptId: t.concept, fromStage: t.from, targetStage: t.to, observedStage: t.to, passed: true, evidence: ["Seeded demo data"] }
      end)
      ts.each { |t| s.stages[t.concept] = t.to }
      svc.send(:close_level, s, level.id, "passed")
      svc.send(:advance, s)
    end
    s.save!
  end
end
