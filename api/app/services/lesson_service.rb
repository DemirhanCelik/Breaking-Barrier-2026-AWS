# Orchestrates the core loop (design §6): diagnostic -> roadmap -> submit ->
# filter -> validate -> route, with the non-adaptive fallback (FR10).
# Student-facing methods return DTOs with NO stage/score/placement (FR13);
# stage data is only produced by the teacher methods.
require "securerandom"

class LessonService
  class Error < StandardError
    attr_reader :status
    def initialize(message, status)
      super(message)
      @status = status
    end
  end

  SAVED = "Your work is saved. Here is your next step.".freeze

  def cur = Curriculum.current

  # ---------------------------------------------------------------- student --

  def unit_info = { id: cur.id, name: cur.unit["name"], summary: cur.unit["summary"] }

  def lesson_state(s) = lesson_phase(s).merge(unit: unit_info)

  # Optional first step: pick a topic that personalizes every step ({{topic}}).
  def choose_topic(s, topic)
    raise Error.new("That topic is not available.", 422) unless cur.topics.include?(topic.to_s)
    s.topic = topic.to_s
    s.save!
    lesson_state(s)
  end

  # The student's topic, or the unit's first topic as the default.
  def topic_for(s) = s.topic.presence || cur.topics.first || "your school"

  def personalize(text, s) = text.is_a?(String) ? text.gsub("{{topic}}", topic_for(s)) : text

  def lesson_phase(s)
    return { phase: "topic", topics: cur.topics } if cur.topics.any? && s.topic.blank? && !s.diagnostic
    return { phase: "diagnostic" } unless s.diagnostic
    steps = s.completed_order.size
    if s.complete
      message = s.mode == "fallback" ? "You worked through every step for today. Your teacher will pick up from here with you." :
                                       "You finished the lesson and built your own project. Great work today."
      return { phase: "complete", stepsCompleted: steps, message: message }
    end
    if s.current_level_id
      return { phase: "level", level: student_level(s.current_level_id, s), path: student_path(s), stepsCompleted: steps,
               teacherNotes: teacher_notes(s) }
    end
    r = Engine.route(routing_state(s))
    { phase: "choose-depth", options: r[:kind] == :choose_depth ? r[:options] : [], path: student_path(s), stepsCompleted: steps,
      teacherNotes: teacher_notes(s) }
  end

  # Student-facing: never includes the answer key, the concept, or the stage.
  def diagnostic_form(s)
    { intro: cur.diagnostic_intro,
      items: cur.diagnostic_for(s.id).map do |q|
        { id: q.id, prompt: q.prompt, figure: q.figure, options: q.options.map { |o| { id: o.id, text: o.text } } }.compact
      end }
  end

  def submit_diagnostic(s, answers)
    raise Error.new("Diagnostic already submitted", 409) if s.diagnostic
    answers = answers.to_h.transform_keys(&:to_s).transform_values(&:to_s)
    placed = Engine.place(answers, cur.diagnostic_for(s.id))
    s.save_diagnostic!(placed)
    s.stages = placed.dup
    advance(s)
    s.save!
    lesson_state(s)
  end

  # Quiet formative signals from the editor (time on step, edit sessions, pastes).
  # Never shown to the student; used by the routing advisor and the teacher view.
  SIGNAL_LIMITS = { "timeOnTaskSec" => 7200, "edits" => 500, "pastes" => 100, "pastedChars" => 20_000 }.freeze

  def self.clean_signals(raw)
    return {} unless raw.respond_to?(:to_h)
    raw.to_h.transform_keys(&:to_s).slice(*SIGNAL_LIMITS.keys).to_h { |k, v| [k, v.to_i.clamp(0, SIGNAL_LIMITS[k])] }
  end

  def submit_work(s, level_id, response, signals = {})
    signals = self.class.clean_signals(signals)
    raise Error.new("That step is no longer current. Reload to continue.", 409) unless s.current_level_id == level_id
    response = response.to_s
    raise Error.new("Response is empty", 422) if response.strip.empty?
    raise Error.new("Response is too long", 422) if response.size > 10_000
    level = cur.level(level_id)
    sub_id = SecureRandom.uuid

    # 1. Filter input (fail-closed). Withheld text is not stored.
    input = ContentFilter.check_input(response)
    FilterAudit.record!(input, student_id: s.id, context: "submission", direction: "input", ref_id: sub_id)
    unless input.ok?
      outcome = { status: "withheld", message: input.message }
      s.create_submission!(sub_id, level_id, nil, outcome, signals)
      s.add_validation!(level_code: level.code, mode: "withheld", submission_id: sub_id, model_meta: { filter: input.source })
      return { submissionId: sub_id }
    end

    # From here on only the filtered text (names masked) is stored or sent to the model.
    response = input.text
    s.last_response[level_id] = response
    st = (s.level_status[level_id] ||= { "attempts" => 0, "status" => "in-progress" })
    st["attempts"] += 1

    outcome = if s.mode == "fallback"
      s.create_submission!(sub_id, level_id, response, {}, signals)
      s.add_validation!(level_code: level.code, mode: "fallback", submission_id: sub_id)
      close_level(s, level_id, "done")
      advance(s)
      continue_outcome(SAVED)
    else
      validate_and_route(s, level, response, sub_id, signals)
    end

    Db.execute("UPDATE submission SET outcome_json = CAST(:o AS jsonb) WHERE id = :id AND student_id = :student AND unit_id = :unit", o: Db.json(outcome), id: sub_id, student: s.id, unit: s.unit_id)
    s.save!
    { submissionId: sub_id }
  end

  def submission(s, sub_id)
    outcome = s.submission_outcome(sub_id) or raise Error.new("Submission not found", 404)
    outcome.empty? ? { status: "checking" } : outcome
  end

  def choose_depth(s, option_id)
    r = Engine.route(routing_state(s))
    unless r[:kind] == :choose_depth && r[:options].any? { |o| o[:id] == option_id }
      raise Error.new("That choice is not available right now.", 409)
    end
    s.depth_choice = option_id
    label = option_id == "project" ? "go to project" : "explore #{cur.concept(option_id).name}"
    s.add_decision!(level_code: "-", level_title: "Depth choice", rule: "Student chose: #{label}.")
    advance(s)
    s.save!
    lesson_state(s)
  end

  def ask_assistant(s, level_id, message, agent_token: nil)
    raise Error.new("That step is not current.", 409) unless s.current_level_id == level_id
    message = message.to_s.strip[0, 1000]
    raise Error.new("Message is empty", 422) if message.empty?
    ref = SecureRandom.uuid
    input = ContentFilter.check_input(message)
    FilterAudit.record!(input, student_id: s.id, context: "assistant", direction: "input", ref_id: ref)
    return { reply: input.message, withheld: true } unless input.ok?

    reply = Coach.new.reply(level: cur.level(level_id), stages: s.stages, last_response: s.last_response[level_id], message: input.text,
                            agent: agent_token.present? ? { token: agent_token, student_id: s.id } : nil, topic: topic_for(s))
    output = ContentFilter.check_output(Coach.hide_step_codes(reply))
    FilterAudit.record!(output, student_id: s.id, context: "assistant", direction: "output", ref_id: ref)
    return { reply: "Let me think about that differently. Try rereading the step instructions.", withheld: true } unless output.ok?
    { reply: output.text, withheld: false }
  end

  # ---------------------------------------------------------------- teacher --

  # Teacher progress reads are scoped by ADMIN-CREATED teaching appointments:
  # a teacher sees a student's progress for the active unit only if an
  # appointment (teacher, student, unit) exists. Class ownership alone grants
  # nothing here. The roster is exactly the appointed students for the unit.
  def class_attainment(teacher_id)
    ids = TeachingAppointment.student_ids_for(teacher_id: teacher_id, unit_id: cur.id)
    students = ids.filter_map { |id| StudentRecord.find(id) }.sort_by(&:display_name)
    { classId: cur.klass["id"], className: cur.klass["name"], unit: unit_info, bar: cur.bar, concepts: teacher_concepts,
      appointedStudents: ids.size, students: students.map { |s| attainment(s) } }
  end

  # Every appointed student's route through the unit, side by side (teacher-only).
  # Students never see this: their own view stays free of levels and comparisons.
  # Per level: done, current, ahead (projected by the rules), or skipped (placement
  # or progress already covers what it teaches).
  def class_paths(teacher_id)
    ids = TeachingAppointment.student_ids_for(teacher_id: teacher_id, unit_id: cur.id)
    students = ids.filter_map { |id| StudentRecord.find(id) }.sort_by(&:display_name)
    levels = cur.levels.map do |l|
      { code: l.code, title: l.title, project: l.project?,
        teaches: l.transitions.map { |t| { conceptId: t.concept, from: t.from, to: t.to } } }
    end
    { unit: unit_info, bar: cur.bar, concepts: teacher_concepts, levels: levels,
      students: students.map { |s| teacher_path(s) } }
  end

  def filter_audit(teacher_id) = FilterAudit.report(cur.klass["id"], student_ids: appointed_ids(teacher_id))
  def insights(teacher_id) = InsightsService.new.report(cur.klass["id"], student_ids: appointed_ids(teacher_id))

  # ---- assignments (teacher) ----------------------------------------------
  # Create/list/archive teacher assignments. Writes go through the Assignment
  # repository, which validates the unit/level against the curriculum and the
  # scope/target consistency. `teacher_id` scopes everything to the caller.

  def list_assignments(teacher_id, status: nil)
    { assignments: Assignment.for_teacher(teacher_id, status: status).map { |a| with_progress(a, teacher_id) },
      concepts: teacher_concepts, currentUnitId: cur.id,
      units: Curriculum.selectable.map { |c| assignable_unit(c) },
      # The teacher's roster for the active unit (admin-appointed students), by
      # name, so the UI offers a student picker instead of a raw id field.
      students: assignable_students(teacher_id) }
  end

  # Students the teacher may assign to: their admin-appointed students for the
  # active unit, as {id, name}.
  def assignable_students(teacher_id)
    appointed_ids(teacher_id).filter_map { |id| StudentRecord.find(id) }
      .sort_by(&:display_name)
      .map { |s| { id: s.id, name: s.display_name } }
  end

  def create_assignment(teacher_id, scope:, target_kind:, unit_id:, klass_id: nil, student_id: nil, level_code: nil, note: nil,
                        concept_id: nil, due_on: nil, group_label: nil)
    if scope.to_s == "class"
      klass_id = klass_id.presence || cur.klass["id"]
      raise Error.new("You do not own that class.", 403) unless teacher_owns_class?(teacher_id, klass_id)
    elsif scope.to_s == "student"
      # Appointment-authoritative: a teacher may assign only to a student they are
      # admin-appointed to for this unit.
      unless TeachingAppointment.allows?(teacher_id: teacher_id, student_id: student_id.to_s, unit_id: cur.id)
        raise Error.new("You are not appointed to this student for this unit.", 403)
      end
    end
    if target_kind.to_s == "concept"
      Assignment.archive_previous_focus!(teacher_id: teacher_id, unit_id: unit_id,
                                         student_id: (student_id if scope.to_s == "student"), klass_id: (klass_id if scope.to_s == "class"))
    end
    a = Assignment.create!(teacher_id: teacher_id, scope: scope, target_kind: target_kind, unit_id: unit_id,
                           klass_id: klass_id, student_id: student_id, level_code: level_code, note: note,
                           concept_id: concept_id, due_on: due_on, group_label: group_label)
    with_progress(a)
  rescue Assignment::Error => e
    raise Error.new(e.message, e.status)
  end

  # One skill focus for a small group (e.g. from Insights): one student-scoped
  # assignment per student, sharing a group label.
  def create_group_focus(teacher_id, student_ids:, concept_id:, note: nil, due_on: nil, group_label: nil)
    ids = Array(student_ids).map(&:to_s).uniq.reject(&:empty?)
    raise Error.new("Pick at least one student.", 422) if ids.empty?
    raise Error.new("That's a lot of students for one group.", 422) if ids.size > 60
    label = group_label.presence || "#{cur.concept(concept_id.to_s).name} group" rescue raise(Error.new("Unknown skill.", 422))
    created = ids.map do |sid|
      create_assignment(teacher_id, scope: "student", target_kind: "concept", unit_id: cur.id, student_id: sid,
                                    concept_id: concept_id, note: note, due_on: due_on, group_label: label)
    end
    { assignments: created, groupLabel: label }
  end

  def archive_assignment(teacher_id, id)
    Assignment.archive!(id, teacher_id: teacher_id).to_json_dto
  rescue Assignment::Error => e
    raise Error.new(e.message, e.status)
  end

  # A unit DTO for the assignment picker: id, name, and its assignable levels.
  def assignable_unit(c)
    { id: c.id, name: c.unit["name"],
      levels: c.levels.map { |l| { code: l.code, title: l.title, kind: l.kind } } }
  end

  def student_trace(teacher_id, student_id)
    unless TeachingAppointment.allows?(teacher_id: teacher_id, student_id: student_id, unit_id: cur.id)
      raise Error.new("You are not appointed to this student for this unit.", 403)
    end
    s = StudentRecord.find(student_id) or raise Error.new("Student not found", 404)
    roadmap = s.diagnostic ? Engine.build_roadmap(routing_state(s)) : { steps: [], gaps: [] }
    base = attainment(s)
    if roadmap[:gaps].any?
      base[:flags] += ["Roadmap gap: no authored route to the bar for #{roadmap[:gaps].map { |g| cur.concept(g).name }.join(', ')}."]
    end
    base.merge(
      bar: cur.bar, concepts: teacher_concepts, roadmap: roadmap[:steps],
      decisions: s.decisions.map { |d| { at: StudentRecord.iso(d["at_ms"]), levelCode: d["level_code"], levelTitle: d["level_title"], rule: d["rule"], vector: d["vector_json"], advisor: d["advisor_json"] } },
      validations: s.validations.map { |v| { at: StudentRecord.iso(v["at_ms"]), levelCode: v["level_code"], mode: v["mode"], results: v["results_json"], signals: v["signals_json"], response: v["response"] } },
      practice: PracticeService.new.for_student(s.id),
    )
  end

  # ------------------------------------------------------------------ demo --

  # "advised" (AI picks among rule-approved candidates) or "rules". Default from ROUTING_MODE.
  def self.routing_mode
    v = Db.query("SELECT value_json FROM app_setting WHERE key = 'routing'").first&.fetch("value_json")
    %w[advised rules].include?(v) ? v : ENV.fetch("ROUTING_MODE", "advised")
  end

  def self.routing_mode=(mode)
    raise Error.new("Routing mode must be advised or rules", 422) unless %w[advised rules].include?(mode)
    Db.execute(<<~SQL, v: Db.json(mode))
      INSERT INTO app_setting (key, value_json) VALUES ('routing', CAST(:v AS jsonb))
      ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json
    SQL
  end

  def self.fault_injection?
    Db.query("SELECT value_json FROM app_setting WHERE key = 'fault'").first&.fetch("value_json") == true
  end

  def self.fault_injection=(on)
    Db.execute(<<~SQL, v: Db.json(on ? true : false))
      INSERT INTO app_setting (key, value_json) VALUES ('fault', CAST(:v AS jsonb))
      ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json
    SQL
  end

  private

  # Students this teacher may see for the active unit (admin appointments).
  def appointed_ids(teacher_id) = TeachingAppointment.student_ids_for(teacher_id: teacher_id, unit_id: cur.id)

  # A teacher owns a class iff klass.teacher_id == teacher_id.
  def teacher_owns_class?(teacher_id, klass_id)
    Db.query("SELECT 1 AS ok FROM klass WHERE id = :k AND teacher_id = :t", k: klass_id, t: teacher_id).any?
  end

  # A teacher "has" a student iff the student is enrolled in a class the teacher owns.
  def teacher_has_student?(teacher_id, student_id)
    return false if student_id.to_s.empty?
    Db.query(<<~SQL, t: teacher_id, s: student_id).any?
      SELECT 1 AS ok FROM enrollment e JOIN klass k ON k.id = e.klass_id
      WHERE e.student_id = :s AND k.teacher_id = :t LIMIT 1
    SQL
  end

  def validate_and_route(s, level, response, sub_id, signals = {})
    s.create_submission!(sub_id, level.id, response, {}, signals)
    begin
      raise Validator::Unavailable, "Fault injection (demo)" if self.class.fault_injection?
      ev = Validator.new.evaluate(level, s.stages, response)
    rescue Validator::Unavailable => e
      Rails.logger.warn("[validate] #{level.code}: #{e.message}")
      s.add_validation!(level_code: level.code, mode: "error", submission_id: sub_id, model_meta: { error: e.message })
      s.flags << "Validation failed after retry on #{level.code}."
      enter_fallback(s, "validation error after retry.")
      close_level(s, level.id, "done")
      advance(s)
      return continue_outcome(SAVED)
    end

    s.add_validation!(level_code: level.code, mode: "adaptive", submission_id: sub_id,
                      results: ev.results.map { |r| filtered_evidence(r.as_json) }, model_meta: ev.model_meta)
    ev.results.each do |r|
      if r.passed
        s.stages[r.concept_id] = r.target_stage
      else
        key = "#{r.concept_id}:#{r.from_stage}"
        s.transition_fails[key] = s.transition_fails.fetch(key, 0) + 1
      end
    end

    hints = Engine.hints_for(level, s.stages.merge(ev.results.to_h { |r| [r.concept_id, r.from_stage] }), response)
    coaching = if ev.all_passed?
      level.project? ? "Your project log is saved. Keep iterating on your page as long as you like." : "Nice work. You covered what this step was about. On to the next one."
    elsif hints.any?
      "You're on your way. #{hints.first(2).join(' ')}"
    else
      # Probes met but the rubric eval wants more depth.
      "You're on your way. Look back at each instruction and add a little more detail about your thinking."
    end
    out = ContentFilter.check_output(coaching)
    FilterAudit.record!(out, student_id: s.id, context: "coaching", direction: "output", ref_id: sub_id)
    coaching = out.ok? ? out.text : "Keep going. Take another look at the instructions for this step."

    if ev.all_passed? || level.project?
      close_level(s, level.id, "passed")
      advance(s)
      return continue_outcome(coaching)
    end

    stuck = ev.results.find { |r| !r.passed && s.transition_fails.fetch("#{r.concept_id}:#{r.from_stage}", 0) >= Engine::MAX_FAILS_PER_TRANSITION }
    if stuck
      name = cur.concept(stuck.concept_id).name
      s.flags << "Repeated difficulty on #{name} (#{stuck.from_stage}→#{stuck.target_stage})."
      enter_fallback(s, "#{Engine::MAX_FAILS_PER_TRANSITION} attempts without meeting #{name} #{stuck.from_stage}→#{stuck.target_stage}.")
      close_level(s, level.id, "exhausted")
      advance(s)
      return continue_outcome("Your work is saved. Let's keep going with the next step.")
    end

    if s.level_status[level.id]["attempts"] >= Engine::MAX_ATTEMPTS_PER_LEVEL
      close_level(s, level.id, "exhausted")
      advance(s)
      return continue_outcome("#{coaching} Next, you'll practice the same idea in a different way.")
    end

    { status: "done", nextAction: "revise", coaching: coaching, offerAssistant: true }
  end

  # Model-written evidence (teacher view only) also passes the output filter.
  def filtered_evidence(result)
    rubric, probes = result[:evidence].partition { |e| e.start_with?("Rubric: ") }
    return result if rubric.empty?
    checked = ContentFilter.check_output(rubric.join("\n"))
    rubric = checked.ok? ? checked.text.split("\n") : ["Rubric: [evidence withheld by content filter]"]
    result.merge(evidence: probes + rubric)
  end

  def continue_outcome(coaching) = { status: "done", nextAction: "continue", coaching: coaching, offerAssistant: false }

  def enter_fallback(s, reason)
    s.mode = "fallback"
    s.flags << "Moved to non-adaptive path: #{reason}"
    s.add_decision!(level_code: "-", level_title: "Fallback", rule: "Fallback: #{reason}")
  end

  def advance(s)
    r = Engine.route(routing_state(s))
    if r[:kind] == :fallback
      enter_fallback(s, r[:reason])
      r = Engine.route(routing_state(s))
    end
    case r[:kind]
    when :level
      if s.current_level_id != r[:level_id]
        advisor = nil
        # Teacher assignments PRIORITIZE (not force): if an active assignment for
        # this student matches one of the rule-approved candidates, pick it and
        # skip the AI advisor. Logged as teacher-assigned for the trace. The
        # engine's own rules still define the candidate set, so an assignment can
        # never route to a level the rules disallow.
        assigned = assigned_pick(s, r)
        if assigned
          r = r.merge(level_id: assigned[:level_id], rule: assigned[:rule])
        elsif r[:candidates] && RoutingAdvisor.enabled?
          # With a teacher focus, the advisor chooses only among focus-building candidates.
          for_advisor = r[:focus] ? r.merge(candidates: r[:candidates].select { |c| c[:serves].any? { |t| t.concept == r[:focus] } }) : r
          advised = RoutingAdvisor.new.advise(s, for_advisor)
          focus_note = r[:focus] && !advised[:rule].start_with?("Teacher focus") ? "Teacher focus: #{cur.concept(r[:focus]).name}. " : ""
          r = r.merge(level_id: advised[:level_id], rule: focus_note + advised[:rule])
          advisor = advised[:advisor]
        end
        lvl = cur.level(r[:level_id])
        s.add_decision!(level_code: lvl.code, level_title: lvl.title, rule: r[:rule], advisor: advisor)
      end
      s.current_level_id = r[:level_id]
      s.level_status[r[:level_id]] ||= { "attempts" => 0, "status" => "in-progress" }
    when :choose_depth
      s.current_level_id = nil
    else
      s.current_level_id = nil
      s.complete = true
    end
  end

  def close_level(s, level_id, status)
    s.level_status[level_id] = { "attempts" => s.level_status.dig(level_id, "attempts") || 0, "status" => status }
    s.completed_order << level_id unless s.completed_order.include?(level_id)
  end

  # If a teacher has an active LEVEL assignment for this student (direct or via
  # class) in the current unit, and that level is among the rule-approved
  # candidates the engine returned, return the override pick. Otherwise nil.
  # Unit-scoped assignments don't pin a specific level (every candidate is
  # already in the active unit), so they don't override here.
  def assigned_pick(s, route)
    candidates = route[:candidates]
    return nil unless candidates&.any?
    assignments = begin
      Assignment.active_for_student_in_unit(s.id, cur.id)
    rescue StandardError => e
      Rails.logger.warn("[assignment] lookup failed: #{e.message}")
      return nil
    end
    assignments.each do |a|
      next unless a.target_kind == "level"
      match = candidates.find { |c| cur.level(c[:level_id]).code == a.level_code }
      next unless match
      lvl = cur.level(match[:level_id])
      scope = a.scope == "student" ? "this student" : "the class"
      return { level_id: match[:level_id],
               rule: "Teacher-assigned: #{lvl.code} (#{lvl.title}) was assigned to #{scope}; " \
                     "it is among the #{candidates.size} rule-approved candidate(s), so it was prioritized over the adaptive pick." }
    end
    nil
  end

  def student_level(level_id, s = nil)
    l = cur.level(level_id)
    p = ->(t) { s ? personalize(t, s) : t }
    { id: l.id, kind: l.kind, title: p.(l.title), intro: p.(l.intro), instructions: l.instructions.map(&p), aiOutput: p.(l.ai_output),
      responseLabel: p.(l.response_label), responsePlaceholder: p.(l.response_placeholder),
      interaction: student_interaction(l), preview: l.preview || nil }.compact
  end

  # Scaffolded task types (Intro to Python): never sends the solution order or answers.
  def student_interaction(l)
    i = l.interaction or return nil
    case i["type"]
    when "parsons" then { type: "parsons", lines: i["lines"].shuffle(random: Random.new(l.id.sum)) }
    when "fill" then { type: "fill", code: i["code"], blanks: i["blanks"].size }
    end
  end

  def student_path(s)
    done = s.completed_order.map { |id| { levelId: id, title: cur.level(id).title, status: "done" } }
    current = s.current_level_id ? [{ levelId: s.current_level_id, title: cur.level(s.current_level_id).title, status: "current" }] : []
    seen = s.completed_order + [s.current_level_id]
    upcoming = Engine.build_roadmap(routing_state(s))[:steps]
      .map { |step| cur.levels.find { |l| l.code == step[:levelCode] }.id }
      .reject { |id| seen.include?(id) }
      .map { |id| { levelId: id, title: cur.level(id).title, status: "upcoming" } }
    done + current + upcoming
  end

  def attainment(s)
    status = if !s.diagnostic then "not-started"
             elsif s.mode == "fallback" then "fallback"
             elsif s.complete then "complete"
             elsif Engine.below_bar(s.stages).empty? then "met-bar"
             elsif s.transition_fails.values.any? { |n| n >= 2 } then "needs-attention"
             else "on-track"
             end
    { studentId: s.id, displayName: s.display_name, status: status, stages: s.stages.dup,
      diagnostic: s.diagnostic&.dup, flags: s.flags.dup, stepsCompleted: s.completed_order.size }
  end

  def teacher_path(s)
    base = attainment(s)
    return base.merge(path: {}, ahead: [], why: nil, focus: nil) unless s.diagnostic

    path = {}
    s.completed_order.each_with_index do |id, i|
      next unless cur.level?(id)
      status = s.level_status.dig(id, "status")
      path[cur.level(id).code] = { state: status == "passed" ? "done" : "moved-on", order: i + 1 }
    end
    if s.current_level_id && cur.level?(s.current_level_id)
      path[cur.level(s.current_level_id).code] = { state: "current", order: path.size + 1 }
    end
    ahead = s.complete ? [] : Engine.build_roadmap(routing_state(s))[:steps].map { |st| st[:levelCode] }.reject { |c| path.key?(c) }
    ahead.each_with_index { |code, i| path[code] = { state: "ahead", order: path.size + 1 } }
    cur.levels.each do |l|
      next if path.key?(l.code)
      path[l.code] = l.project? && !s.complete ? { state: "ahead", order: path.count { |_, v| v[:order] } + 1 } : { state: "skipped" }
    end

    last = s.decisions.first
    why = last && { levelCode: last["level_code"], rule: last["rule"], advisor: last.dig("advisor_json", "reason") }
    focus = s.mode == "fallback" ? nil : focus_for(s)
    focus = nil if focus && s.stages.fetch(focus.concept_id, 0) >= cur.bar
    base.merge(path: path, ahead: ahead, why: why, focus: focus && { conceptId: focus.concept_id, name: cur.concept(focus.concept_id).name })
  end

  # ---- assignment focus + status --------------------------------------------

  # Engine state plus the student's active teacher focus (if any).
  def routing_state(s) = s.engine_state.merge("focus" => focus_for(s)&.concept_id)

  # The newest active skill focus that applies to this student in this unit
  # (a direct assignment wins over a class-wide one).
  def focus_for(s)
    active_assignments_for(s).find { |a| a.target_kind == "concept" }
  end

  def active_assignments_for(s)
    @active_assignments ||= {}
    @active_assignments[[s.id, cur.id]] ||= Assignment.active_for_student_in_unit(s.id, cur.id)
  rescue StandardError => e
    Rails.logger.warn("[assignment] lookup failed: #{e.message}")
    []
  end

  # Student-facing notes from the teacher: what to focus on and the teacher's own
  # words. Never levels, stages, or anything about other students.
  def teacher_notes(s)
    steering = focus_for(s)
    active_assignments_for(s).filter_map do |a|
      next if a.target_kind == "concept" && a.id != steering&.id
      focus = a.target_kind == "concept" && cur.concept(a.concept_id)
      next if focus && s.stages.fetch(a.concept_id, 0) >= cur.bar && a.note.blank?
      text = if focus then "Focus for now: #{focus.name}."
             elsif a.target_kind == "level" then "Your teacher picked a step for you to work on soon."
             end
      text = [text, a.note.presence].compact.join(" ")
      next if text.blank?
      { id: a.id, text: text, from: teacher_name(a.teacher_id), dueOn: a.due_on }.compact
    end.first(3)
  end

  def teacher_name(id)
    @teacher_names ||= {}
    @teacher_names[id] ||= Db.query("SELECT display_name FROM app_user WHERE id = :id", id: id).first&.fetch("display_name").to_s.sub(/\s*\(teacher\)\z/, "").presence || "Your teacher"
  end

  # The assignment DTO plus how it is landing for each student it applies to.
  def with_progress(a, teacher_id = a.teacher_id)
    ids = a.scope == "student" ? [a.student_id] : TeachingAppointment.student_ids_for(teacher_id: teacher_id, unit_id: a.unit_id)
    rows = Curriculum.with_unit(a.unit_id) do
      ids.filter_map { |id| StudentRecord.find(id) }.sort_by(&:display_name).map { |s| assignment_status(a, s) }
    end
    a.to_json_dto.merge(progress: a.status == "active" ? rows : [],
                        conceptName: a.concept_id && Curriculum.unit(a.unit_id).concept(a.concept_id)&.name,
                        levelTitle: a.level_code && Curriculum.unit(a.unit_id).levels.find { |l| l.code == a.level_code }&.title).compact
  end

  # state: met | active | queued | waiting | blocked; detail is teacher-facing.
  def assignment_status(a, s)
    st = ->(state, detail) do
      overdue = a.due_on.present? && state != "met" && Date.iso8601(a.due_on) < Date.current
      { studentId: s.id, name: s.display_name, state: state, detail: detail, overdue: overdue || nil }.compact
    end
    return st.("waiting", "Hasn't started this course yet.") unless s.diagnostic
    return st.("met", "Finished the course.") if s.complete && a.target_kind != "concept"

    current = s.current_level_id && cur.level(s.current_level_id)
    roadmap = Engine.build_roadmap(routing_state(s))[:steps]
    case a.target_kind
    when "unit"
      st.("active", "#{s.completed_order.size} step#{'s' unless s.completed_order.size == 1} done#{current ? ", now on #{current.code}" : ''}.")
    when "concept"
      concept = cur.concept(a.concept_id)
      stage = s.stages.fetch(a.concept_id, 0)
      return st.("met", "Meets the class bar in #{concept.name} (stage #{stage}).") if stage >= cur.bar
      steering = focus_for(s)
      if steering && steering.id != a.id
        return st.("waiting", "Their own focus on #{cur.concept(steering.concept_id).name} comes first.")
      end
      return st.("blocked", "On the guided path, so the focus can't steer their steps.") if s.mode == "fallback"
      if current && current.transitions.any? { |t| t.concept == a.concept_id && t.from == stage }
        return st.("active", "Working on it now: #{current.code} · #{current.title}.")
      end
      nxt = roadmap.find { |step| step[:targets].include?(a.concept_id) }
      return st.("queued", "Next up after the current step: #{nxt[:levelCode]} · #{nxt[:title]}.") if nxt
      st.("blocked", "No step left that builds #{concept.name} from stage #{stage}. A mini-lesson may help.")
    when "level"
      level = cur.levels.find { |l| l.code == a.level_code }
      return st.("blocked", "That step isn't in this course.") unless level
      status = s.level_status.dig(level.id, "status")
      return st.("met", "Done.") if %w[passed done].include?(status)
      return st.("met", "Moved on after their tries on it.") if status == "exhausted"
      return st.("active", "Working on it now.") if current&.id == level.id
      return st.("queued", "Coming up on their path.") if roadmap.any? { |step| step[:levelCode] == level.code }
      ahead = level.transitions.select { |t| s.stages.fetch(t.concept, 0) < t.from }
      if ahead.any?
        need = ahead.map { |t| "#{cur.concept(t.concept).name} stage #{t.from}" }.join(", ")
        return st.("blocked", "Not reachable yet: needs #{need} first.")
      end
      st.("met", "Already past what this step teaches.")
    end
  end

  def teacher_concepts
    cur.concepts.map { |c| { id: c.id, name: c.name, csta: c.csta, descriptors: c.descriptors.transform_keys(&:to_s) } }
  end
end
