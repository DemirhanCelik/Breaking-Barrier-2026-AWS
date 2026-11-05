# Deterministic adaptive engine (design §6.1, §8). Pure functions over an
# engine state hash; no I/O. Mirrors web/src/api/mock/engine.ts.
#
# state = {
#   "mode" => "adaptive" | "fallback",
#   "stages" => { concept_id => 0..3 },
#   "level_status" => { level_id => { "attempts" => n, "status" => "in-progress|passed|exhausted|done" } },
#   "depth_choice" => nil | concept_id | "project",
#   "focus" => nil | concept_id,   # teacher-assigned skill focus (optional)
# }
module Engine
  MAX_ATTEMPTS_PER_LEVEL = 2  # then route to an alternate level for the same transition
  MAX_FAILS_PER_TRANSITION = 4 # then fallback + teacher flag (design §14)
  CLOSED = %w[passed exhausted done].freeze

  module_function

  def cur = Curriculum.current
  def bar = cur.bar

  def zero_vector = cur.required_concepts.to_h { |c| [c, 0] }

  # FR1: ladder placement. For each concept, climb Stage 1, 2, 3 while the student
  # answers that stage's question correctly; the first miss (or unanswered
  # question) stops the climb. Promotes from Stage 0 only.
  def place(answers, questions)
    placed = zero_vector
    questions.group_by(&:concept).each do |cid, qs|
      qs.sort_by(&:stage).each do |q|
        break unless answers[q.id].to_s == q.answer
        placed[cid] = q.stage
      end
    end
    placed
  end

  # Self-placement: the student taps one card instead of answering a quiz. The
  # choice sets the SAME starting stage for every required concept, and the
  # engine re-measures on every real submission, so a mis-tap self-corrects.
  #   new        -> stage 0            (full roadmap to the bar)
  #   dabbled    -> bar - 1            (some steps already covered)
  #   comfortable-> bar                (routes to depth/project)
  PLACEMENT_LEVELS = %w[new dabbled comfortable].freeze

  def placement_stage(level)
    case level.to_s
    when "new" then 0
    when "dabbled" then [bar - 1, 0].max
    when "comfortable" then bar
    else raise ArgumentError, "Unknown placement level #{level}"
    end
  end

  def place_self(level)
    stage = placement_stage(level)
    cur.required_concepts.to_h { |c| [c, stage] }
  end

  # The three cards the student chooses from (student-facing copy; no stage/score).
  def placement_options
    [
      { id: "new", label: "New to this", description: "I haven't really done this before. Start me from the beginning." },
      { id: "dabbled", label: "I've dabbled", description: "I've tried some of this. Skip the basics where it makes sense." },
      { id: "comfortable", label: "I'm comfortable", description: "I know this well. Take me toward the project." },
    ]
  end

  def below_bar(stages) = cur.required_concepts.select { |c| stages.fetch(c, 0) < bar }

  def applicable_transitions(level, stages)
    level.transitions.select { |t| cur.required_concepts.include?(t.concept) && stages.fetch(t.concept, 0) == t.from }
  end

  def closed?(state, level_id) = CLOSED.include?(state.dig("level_status", level_id, "status"))

  def fmt_vector(v) = cur.required_concepts.map { |c| "#{cur.concept(c).name} #{v.fetch(c, 0)}" }.join(", ")

  # Returns one of:
  #   { kind: :level, level_id:, rule:, candidates: [{ level_id:, serves: }] }  (candidates only when below bar)
  #   { kind: :choose_depth, options: [...] }
  #   { kind: :complete }
  #   { kind: :fallback, reason: }
  def route(state)
    if state["mode"] == "fallback"
      nxt = cur.fallback_sequence.find { |id| !closed?(state, id) }
      return { kind: :complete } unless nxt
      return { kind: :level, level_id: nxt, rule: "Non-adaptive path: next authored level in the fixed sequence (#{cur.level(nxt).code})." }
    end

    stages = state["stages"]
    below = below_bar(stages)
    if below.any?
      scored = cur.levels.each_with_index.filter_map do |l, index|
        next if l.project? || closed?(state, l.id)
        serves = applicable_transitions(l, stages).select { |t| below.include?(t.concept) && t.to <= bar }
        next if serves.empty?
        { level: l, index: index, serves: serves,
          min_stage: serves.map { |t| stages.fetch(t.concept, 0) }.min,
          min_order: serves.map { |t| cur.concept(t.concept).order }.min }
      end
      # A teacher's skill focus comes first (only among rule-approved levels, so it never
      # skips prerequisites); then most below-bar concepts advanced; tie-break lowest
      # current stage, then concept order, then authored order.
      focus = state["focus"]
      focus = nil unless focus && below.include?(focus)
      serves_focus = ->(c) { focus && c[:serves].any? { |t| t.concept == focus } }
      scored.sort_by! { |c| [serves_focus.(c) ? 0 : 1, -c[:serves].size, c[:min_stage], c[:min_order], c[:index]] }
      names = below.map { |c| cur.concept(c).name }.join(", ")
      return { kind: :fallback, reason: "No authored level left for #{names}." } if scored.empty?

      pick = scored.first
      serves = pick[:serves].map { |t| "#{cur.concept(t.concept).name} #{t.from}→#{t.to}" }.join("; ")
      focus_note = serves_focus.(pick) ? "Teacher focus: #{cur.concept(focus).name}. " : ""
      return {
        kind: :level, level_id: pick[:level].id,
        # Every rule-approved option, for the AI routing advisor (RoutingAdvisor) to choose among.
        candidates: scored.map { |c| { level_id: c[:level].id, serves: c[:serves] } },
        focus: (focus if serves_focus.(pick)),
        rule: "#{focus_note}Below bar: #{names}. Picked #{pick[:level].code}: advances #{pick[:serves].size} below-bar concept(s) (#{serves}), " \
              "#{focus_note.empty? ? "the most of #{scored.size} candidate level(s)" : "the best match for the focus among #{scored.size} candidate level(s)"}. " \
              "Tie-break: lowest current stage, then concept order. Vector: #{fmt_vector(stages)}.",
      }
    end

    # Every required concept is at the bar: optional Stage 3 depth, then the project.
    return { kind: :choose_depth, options: depth_options(state) } if state["depth_choice"].nil?

    choice = state["depth_choice"]
    if choice != "project" && stages.fetch(choice, 0) == bar
      depth = cur.levels.find { |l| !closed?(state, l.id) && l.transitions.any? { |t| t.concept == choice && t.from == bar && t.to == bar + 1 } }
      if depth
        return { kind: :level, level_id: depth.id,
                 rule: "All required concepts at bar. Student chose optional depth on #{cur.concept(choice).name}: #{depth.code}." }
      end
    end
    unless closed?(state, cur.project_level_id)
      return { kind: :level, level_id: cur.project_level_id, rule: "All required concepts at bar. Routing to the project culmination." }
    end
    { kind: :complete }
  end

  def depth_options(state)
    stages = state["stages"]
    opts = cur.concepts.filter_map do |c|
      next unless stages.fetch(c.id, 0) == bar
      lvl = cur.levels.find { |l| !closed?(state, l.id) && l.transitions.any? { |t| t.concept == c.id && t.from == bar } }
      lvl && { id: c.id, label: lvl.title, description: lvl.intro }
    end
    project = cur.level(cur.project_level_id)
    opts << { id: "project", label: project.title, description: "Jump straight into building your own page." }
  end

  # FR2 / M2: simulate routing forward, assuming each routed level is passed,
  # until every required concept reaches the bar. `gaps` must be empty.
  def build_roadmap(state)
    sim = Marshal.load(Marshal.dump(state))
    steps = []
    (cur.levels.size + 2).times do
      r = route(sim)
      break unless r[:kind] == :level
      level = cur.level(r[:level_id])
      advances = applicable_transitions(level, sim["stages"]).select do |t|
        sim["mode"] == "fallback" || sim["stages"].fetch(t.concept, 0) < bar || sim["depth_choice"] == t.concept
      end
      steps << { levelCode: level.code, title: level.title, targets: advances.map(&:concept) }
      advances.each { |t| sim["stages"][t.concept] = t.to } if sim["mode"] == "adaptive"
      sim["level_status"][level.id] = { "attempts" => 1, "status" => "passed" }
      break if level.id == cur.project_level_id
      sim["depth_choice"] = "project" if sim["mode"] == "adaptive" && below_bar(sim["stages"]).empty? && sim["depth_choice"].nil?
    end
    { steps: steps, gaps: sim["mode"] == "adaptive" ? below_bar(sim["stages"]) : [] }
  end

  # Deterministic probes for each applicable transition (design §7 step 2).
  # A failed probe caps the stage: the transition cannot pass regardless of the model.
  def probe(level, stages, text)
    applicable_transitions(level, stages).map do |t|
      outcomes = t.checks.map { |id| [cur.check(id), cur.check(id).test(text)] }
      { transition: t, ok: outcomes.all? { |_, ok| ok }, outcomes: outcomes }
    end
  end

  # Authored hints for checks not yet met, de-duplicated, in authored order.
  def hints_for(level, stages, text)
    applicable_transitions(level, stages).flat_map(&:checks).uniq
      .map { |id| cur.check(id) }.reject { |c| c.test(text) }.map(&:hint)
  end
end
