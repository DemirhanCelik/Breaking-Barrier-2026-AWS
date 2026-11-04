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

  def lesson_state(s)
    return { phase: "diagnostic" } unless s.diagnostic
    steps = s.completed_order.size
    if s.complete
      message = s.mode == "fallback" ? "You worked through every step for today. Your teacher will pick up from here with you." :
                                       "You finished the lesson and built your own club page. Great work today."
      return { phase: "complete", stepsCompleted: steps, message: message }
    end
    if s.current_level_id
      return { phase: "level", level: student_level(s.current_level_id), path: student_path(s), stepsCompleted: steps }
    end
    r = Engine.route(s.engine_state)
    { phase: "choose-depth", options: r[:kind] == :choose_depth ? r[:options] : [], path: student_path(s), stepsCompleted: steps }
  end

  def diagnostic_form
    { intro: cur.diagnostic_intro,
      items: cur.diagnostic_items.map { |i| { id: i.id, prompt: i.prompt, options: i.options.map { |o| { id: o.id, text: o.text } } } } }
  end

  def submit_diagnostic(s, answers)
    raise Error.new("Diagnostic already submitted", 409) if s.diagnostic
    answers = answers.to_h.transform_keys(&:to_s).transform_values(&:to_s)
    placed = Engine.place(answers)
    s.save_diagnostic!(placed)
    s.stages = placed.dup
    advance(s)
    s.save!
    lesson_state(s)
  end

  def submit_work(s, level_id, response)
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
      s.create_submission!(sub_id, level_id, nil, outcome)
      s.add_validation!(level_code: level.code, mode: "withheld", submission_id: sub_id, model_meta: { filter: input.source })
      return { submissionId: sub_id }
    end

    s.last_response[level_id] = response
    st = (s.level_status[level_id] ||= { "attempts" => 0, "status" => "in-progress" })
    st["attempts"] += 1

    outcome = if s.mode == "fallback"
      s.create_submission!(sub_id, level_id, response, {})
      s.add_validation!(level_code: level.code, mode: "fallback", submission_id: sub_id)
      close_level(s, level_id, "done")
      advance(s)
      continue_outcome(SAVED)
    else
      validate_and_route(s, level, response, sub_id)
    end

    Db.execute("UPDATE submission SET outcome_json = CAST(:o AS jsonb) WHERE id = :id", o: Db.json(outcome), id: sub_id)
    s.save!
    { submissionId: sub_id }
  end

  def submission(s, sub_id)
    outcome = s.submission_outcome(sub_id) or raise Error.new("Submission not found", 404)
    outcome.empty? ? { status: "checking" } : outcome
  end

  def choose_depth(s, option_id)
    r = Engine.route(s.engine_state)
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

    reply = Coach.new.reply(level: cur.level(level_id), stages: s.stages, last_response: s.last_response[level_id], message: message,
                            agent: agent_token.present? ? { token: agent_token, student_id: s.id } : nil)
    output = ContentFilter.check_output(reply)
    FilterAudit.record!(output, student_id: s.id, context: "assistant", direction: "output", ref_id: ref)
    return { reply: "Let me think about that differently. Try rereading the step instructions.", withheld: true } unless output.ok?
    { reply: reply, withheld: false }
  end

  # ---------------------------------------------------------------- teacher --

  def class_attainment
    { classId: cur.klass["id"], className: cur.klass["name"], bar: cur.bar, concepts: teacher_concepts,
      students: StudentRecord.all_in_class(cur.klass["id"]).map { |s| attainment(s) } }
  end

  def filter_audit = FilterAudit.report(cur.klass["id"])

  def student_trace(student_id)
    s = StudentRecord.find(student_id) or raise Error.new("Student not found", 404)
    roadmap = s.diagnostic ? Engine.build_roadmap(s.engine_state) : { steps: [], gaps: [] }
    base = attainment(s)
    if roadmap[:gaps].any?
      base[:flags] += ["Roadmap gap: no authored route to the bar for #{roadmap[:gaps].map { |g| cur.concept(g).name }.join(', ')}."]
    end
    base.merge(
      bar: cur.bar, concepts: teacher_concepts, roadmap: roadmap[:steps],
      decisions: s.decisions.map { |d| { at: StudentRecord.iso(d["at_ms"]), levelCode: d["level_code"], levelTitle: d["level_title"], rule: d["rule"], vector: d["vector_json"], advisor: d["advisor_json"] } },
      validations: s.validations.map { |v| { at: StudentRecord.iso(v["at_ms"]), levelCode: v["level_code"], mode: v["mode"], results: v["results_json"] } },
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

  def validate_and_route(s, level, response, sub_id)
    s.create_submission!(sub_id, level.id, response, {})
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
                      results: ev.results.map(&:as_json), model_meta: ev.model_meta)
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
    coaching = "Keep going. Take another look at the instructions for this step." unless out.ok?

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

  def continue_outcome(coaching) = { status: "done", nextAction: "continue", coaching: coaching, offerAssistant: false }

  def enter_fallback(s, reason)
    s.mode = "fallback"
    s.flags << "Moved to non-adaptive path: #{reason}"
    s.add_decision!(level_code: "-", level_title: "Fallback", rule: "Fallback: #{reason}")
  end

  def advance(s)
    r = Engine.route(s.engine_state)
    if r[:kind] == :fallback
      enter_fallback(s, r[:reason])
      r = Engine.route(s.engine_state)
    end
    case r[:kind]
    when :level
      if s.current_level_id != r[:level_id]
        advisor = nil
        if r[:candidates] && RoutingAdvisor.enabled?
          advised = RoutingAdvisor.new.advise(s, r)
          r = r.merge(level_id: advised[:level_id], rule: advised[:rule])
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

  def student_level(level_id)
    l = cur.level(level_id)
    { id: l.id, kind: l.kind, title: l.title, intro: l.intro, instructions: l.instructions, aiOutput: l.ai_output,
      responseLabel: l.response_label, responsePlaceholder: l.response_placeholder }.compact
  end

  def student_path(s)
    done = s.completed_order.map { |id| { levelId: id, title: cur.level(id).title, status: "done" } }
    current = s.current_level_id ? [{ levelId: s.current_level_id, title: cur.level(s.current_level_id).title, status: "current" }] : []
    seen = s.completed_order + [s.current_level_id]
    upcoming = Engine.build_roadmap(s.engine_state)[:steps]
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

  def teacher_concepts
    cur.concepts.map { |c| { id: c.id, name: c.name, csta: c.csta, descriptors: c.descriptors.transform_keys(&:to_s) } }
  end
end
