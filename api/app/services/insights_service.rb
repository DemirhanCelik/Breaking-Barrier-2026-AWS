# Teacher Insights: differentiation help for one teacher with a mixed class
# (vision doc: "differentiation has been the number one teacher pain point").
#
#   needsHelp   students who are stuck right now, each with plain-language
#               reasons from fixed rules (explainable, NFR4)
#   groups      students who share the same missing skill on their latest
#               attempt, so the teacher can pull a small group
#   concepts    how many students are at each stage on each concept
#
# Missing skills come from re-running the deterministic probes on each
# student's latest unsuccessful submission, so grouping never depends on a model.
# Teacher-only: stage data and student work never reach students (FR12/FR13).
class InsightsService
  LONG_STEP_SEC = 8 * 60
  MANY_EDITS = 6

  MINI_LESSON_SYSTEM = <<~PROMPT.freeze
    You help a high-school computer science teacher run a 5-minute small-group mini-lesson for a few students who
    share one gap, in %<context>s. Be concrete and classroom-ready.
    Use a fresh example, not the lesson's own project. Do not name or single out students. Never frame it as a test.
    Respond with only JSON:
    {"title":"...","goal":"<one sentence>","warmup":"<one question to open with>","example":"<a short worked example>",
     "tryIt":["<prompt 1>","<prompt 2>"],"check":"<one quick check for understanding>"}
  PROMPT

  def cur = Curriculum.current

  def report(klass_id)
    students = StudentRecord.all_in_class(klass_id)
    latest = latest_attempts(klass_id)
    {
      needsHelp: students.filter_map { |s| needs_help(s, latest[s.id]) }.sort_by { |h| -h[:reasons].size },
      groups: groups(students, latest),
      concepts: cur.concepts.map do |c|
        started = students.select(&:diagnostic)
        { conceptId: c.id, name: c.name, byStage: (0..3).map { |st| started.count { |s| s.stages.fetch(c.id, 0) == st } } }
      end,
      bar: cur.bar,
    }
  end

  # 5-minute small-group lesson for one missing skill (teacher-facing).
  def mini_lesson(check_id)
    check = cur.checks[check_id.to_s] or raise LessonService::Error.new("Unknown skill", 404)
    t = cur.levels.flat_map(&:transitions).find { |tr| tr.checks.include?(check.id) }
    concept = cur.concept(t.concept)
    fallback = authored_mini_lesson(check, concept, t)
    return fallback.merge(source: "authored") if Validator.mode == "probes"

    prompt = <<~P
      Skill students are missing: #{check.label}
      Coaching hint we give students: #{check.hint}
      Concept: #{concept.name}. Target behavior: "#{concept.descriptors[t.to]}"
    P
    r = ModelClient.default.complete(system: format(MINI_LESSON_SYSTEM, context: cur.context), prompt: prompt, max_tokens: 600, temperature: 0.5)
    data = ModelJson.parse(r.text)
    lesson = {
      title: data["title"].to_s, goal: data["goal"].to_s, warmup: data["warmup"].to_s, example: data["example"].to_s,
      tryIt: Array(data["tryIt"]).map(&:to_s).first(3), check: data["check"].to_s,
    }
    raise ModelJson::Invalid, "incomplete" if lesson.values_at(:title, :goal, :example).any?(&:blank?)
    filter = ContentFilter.check_output(lesson.values.flatten.join("\n"))
    return fallback.merge(source: "authored", note: "AI draft withheld by the content filter.") unless filter.ok?
    lesson.merge(skill: check.label, concept: concept.name, source: "ai")
  rescue ModelClient::Unavailable, ModelJson::Invalid
    fallback.merge(source: "authored", note: "AI unavailable; showing the authored outline.")
  end

  private

  # Latest adaptive attempt per student, with the submitted text and signals.
  def latest_attempts(klass_id)
    Db.query(<<~SQL, k: klass_id, unit: cur.id).to_h { |r| [r["student_id"], r] }
      SELECT DISTINCT ON (v.student_id) v.student_id, v.level_code, v.results_json, s.content, s.signals_json,
             CAST(floor(extract(epoch FROM v.created_at) * 1000) AS bigint) AS at_ms
      FROM validation_result v JOIN submission s ON s.id = v.submission_id
      WHERE v.unit_id = :unit AND v.mode = 'adaptive' AND v.student_id IN (SELECT student_id FROM enrollment WHERE klass_id = :k)
      ORDER BY v.student_id, v.id DESC
    SQL
  end

  def needs_help(s, latest)
    return nil unless s.diagnostic && !s.complete
    reasons = []
    reasons << "Moved to the non-adaptive path" if s.mode == "fallback"
    s.transition_fails.each do |key, n|
      next if n.to_i < 2
      c, from = key.split(":")
      reasons << "#{n} tries without meeting #{cur.concept(c).name} #{from}→#{from.to_i + 1}"
    end
    attempts = s.level_status.dig(s.current_level_id, "attempts").to_i if s.current_level_id
    reasons << "#{attempts} attempts on the current step" if attempts.to_i >= 2
    sig = latest && latest["signals_json"].is_a?(Hash) ? latest["signals_json"] : {}
    if sig["timeOnTaskSec"].to_i >= LONG_STEP_SEC
      reasons << "#{(sig['timeOnTaskSec'].to_i / 60.0).round} min on their last step"
    end
    reasons << "#{sig['edits']} rewrites before submitting" if sig["edits"].to_i >= MANY_EDITS
    return nil if reasons.empty?
    level = s.current_level_id && cur.level?(s.current_level_id) ? cur.level(s.current_level_id) : nil
    { studentId: s.id, displayName: s.display_name, reasons: reasons.uniq, levelCode: level&.code, levelTitle: level&.title }
  end

  def groups(students, latest)
    by_check = Hash.new { |h, k| h[k] = [] }
    students.each do |s|
      a = latest[s.id] or next
      failed = Array(a["results_json"]).reject { |r| r["passed"] }
      next if failed.empty?
      level = cur.levels.find { |l| l.code == a["level_code"] } or next
      failed.each do |r|
        next unless s.stages.fetch(r["conceptId"], 0) < cur.bar || r["fromStage"].to_i >= cur.bar
        t = level.transitions.find { |tr| tr.concept == r["conceptId"] && tr.from == r["fromStage"].to_i } or next
        t.checks.map { |id| cur.check(id) }.reject { |c| c.test(a["content"].to_s) }.each do |c|
          by_check[c.id] << { studentId: s.id, displayName: s.display_name } unless by_check[c.id].any? { |x| x[:studentId] == s.id }
        end
      end
    end
    by_check.map do |cid, members|
      check = cur.check(cid)
      t = cur.levels.flat_map(&:transitions).find { |tr| tr.checks.include?(cid) }
      { checkId: cid, skill: check.label, hint: check.hint, conceptId: t.concept, conceptName: cur.concept(t.concept).name, students: members }
    end.sort_by { |g| -g[:students].size }
  end

  def authored_mini_lesson(check, concept, t)
    {
      title: "Mini-lesson: #{check.label}", skill: check.label, concept: concept.name,
      goal: "Students show this in their own work: #{concept.descriptors[t.to]}",
      warmup: "Look at this request to an AI: \"make a page for the bake sale\". What would you add so the AI gets it right?",
      example: "Model it out loud on a fresh example, then point to where it shows: #{check.hint}",
      tryIt: ["Each student revises their last answer using the hint above.", "Pairs swap and check each other's revision for it."],
      check: "Ask each student to point to the exact words in their revision that show it.",
    }
  end
end
