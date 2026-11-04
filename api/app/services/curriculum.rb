# Authored curriculum loaded from config/curriculum/*.yml. Concept-agnostic:
# the engine only reads these structures, so swapping the unit is a data change.
require "yaml"
require "json"
require "digest"

class Curriculum
  Concept = Struct.new(:id, :name, :csta, :order, :descriptors, keyword_init: true)
  Check = Struct.new(:id, :label, :hint, :type, :spec, keyword_init: true) do
    def test(text)
      text = text.to_s
      case type
      when "regex" then Regexp.new(spec["pattern"], Regexp::IGNORECASE).match?(text)
      when "all_of" then spec["patterns"].all? { |p| Regexp.new(p, Regexp::IGNORECASE).match?(text) }
      when "min_words" then text.split(/\s+/).reject(&:empty?).size >= spec["min"]
      when "list_items"
        items = text.lines.count { |l| l.match?(/\A\s*([-*•]|\d+[.)])\s+\S/) }
        items >= spec["min"] || text.split(",").size >= spec["min"] + 1
      # Drag-and-drop ordering (Parsons problem): the submitted lines, in order, match the solution.
      when "parsons"
        text.lines.map(&:rstrip).reject(&:empty?) == spec["solution"].map(&:rstrip)
      # Fill in the blank: response is {"blanks": [...]}; blank `index` must fully match one accepted pattern.
      when "blank"
        answer = (JSON.parse(text)["blanks"] || [])[spec["index"]].to_s.strip rescue ""
        spec["accept"].any? { |p| answer.match?(/\A(?:#{p})\z/) }
      else raise ArgumentError, "Unknown check type #{type}"
      end
    end
  end
  Transition = Struct.new(:concept, :from, :to, :checks, keyword_init: true)
  Level = Struct.new(:id, :code, :kind, :title, :intro, :instructions, :ai_output,
                     :response_label, :response_placeholder, :transitions, :interaction, :preview, keyword_init: true) do
    def project? = kind == "project"
    # Scaffolded task types (parsons, fill) are graded deterministically, with no model call.
    def deterministic? = interaction.present?
  end
  DiagnosticOption = Struct.new(:id, :text, keyword_init: true)
  # One multiple-choice question for one concept at one stage; `answer` is an option id.
  DiagnosticQuestion = Struct.new(:id, :concept, :stage, :prompt, :figure, :options, :answer, keyword_init: true)

  attr_reader :unit, :klass, :bar, :required_concepts, :concepts, :checks, :levels,
              :project_level_id, :fallback_sequence, :diagnostic_intro, :diagnostic_bank, :practice, :topics

  DIR = Rails.root.join("config/curriculum")
  DEFAULT_UNIT = "digital_magazine"
  SETTING_TTL = 5 # seconds; the active unit is a class setting shared by all API instances

  # The class's active unit. Engines are concept-agnostic: swapping the unit is a
  # data change (one YAML file). Thread.current[:codeai_unit] pins a unit for a
  # block of work (benchmark, seeding).
  def self.current = unit(current_unit_id)

  def self.unit(id)
    raise ArgumentError, "Unknown unit #{id}" unless unit_ids.include?(id.to_s)
    (@units ||= {})[id.to_s] ||= load_file(DIR.join("#{id}.yml"))
  end

  # Every YAML in config/curriculum with a top-level `unit:` block.
  def self.unit_ids
    @unit_ids ||= Dir[DIR.join("*.yml")].map { |f| File.basename(f, ".yml") }
                    .select { |id| YAML.safe_load_file(DIR.join("#{id}.yml")).is_a?(Hash) && YAML.safe_load_file(DIR.join("#{id}.yml")).key?("unit") }
                    .sort
  end

  # Units a teacher can pick (the original demo unit is kept only for the M5 benchmark).
  def self.selectable
    unit_ids.map { |id| unit(id) }.select { |c| c.unit["selectable"] }
  end

  def self.current_unit_id = Thread.current[:codeai_unit] || assigned_unit_id

  def self.assigned_unit_id
    now = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    if @setting_at.nil? || now - @setting_at > SETTING_TTL
      @setting = begin
        Db.query("SELECT value_json FROM app_setting WHERE key = 'unit'").first&.fetch("value_json")
      rescue StandardError
        nil
      end
      @setting_at = now
    end
    id = @setting.presence || ENV["CURRICULUM"].presence || DEFAULT_UNIT
    unit_ids.include?(id) ? id : DEFAULT_UNIT
  end

  def self.current_unit_id=(id)
    raise ArgumentError, "Unknown unit #{id}" unless unit_ids.include?(id.to_s)
    Db.execute(<<~SQL, v: Db.json(id.to_s))
      INSERT INTO app_setting (key, value_json) VALUES ('unit', CAST(:v AS jsonb))
      ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json
    SQL
    @setting = id.to_s
    @setting_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
  end

  def self.with_unit(id)
    unit(id) # Validate before pinning the request to a curriculum.
    prev = Thread.current[:codeai_unit]
    Thread.current[:codeai_unit] = id.to_s
    yield
  ensure
    Thread.current[:codeai_unit] = prev
  end

  def id = @unit["id"]
  # One line describing the lesson, used in every AI prompt (coach, validator, generators).
  def context = @unit["context"].presence || "a computer science lesson"

  def self.load_file(path)
    new(YAML.safe_load_file(path))
  end

  def initialize(data)
    @unit = data.fetch("unit")
    @klass = data.fetch("class")
    @bar = @klass.fetch("bar")
    @required_concepts = data.fetch("required_concepts")
    @concepts = data.fetch("concepts").map do |c|
      Concept.new(id: c["id"], name: c["name"], csta: c["csta"], order: c["order"],
                  descriptors: c["descriptors"].transform_keys(&:to_i))
    end
    @checks = data.fetch("checks").to_h do |id, c|
      [id, Check.new(id: id, label: c["label"], hint: c["hint"], type: c["type"], spec: c.except("label", "hint", "type"))]
    end
    @levels = data.fetch("levels").map do |l|
      Level.new(
        id: l["id"], code: l["code"], kind: l["kind"], title: l["title"], intro: l["intro"],
        instructions: l["instructions"], ai_output: l["ai_output"],
        response_label: l["response_label"], response_placeholder: l["response_placeholder"], interaction: l["interaction"], preview: l["preview"] == true,
        transitions: (l["transitions"] || []).map { |t| Transition.new(concept: t["concept"], from: t["from"], to: t["to"], checks: t["checks"]) },
      )
    end
    @project_level_id = data.fetch("project_level_id")
    @fallback_sequence = data.fetch("fallback_sequence")
    @practice = data["practice"] || []
    # Optional personalization: the student picks a topic; {{topic}} in level text is filled in.
    @topics = data["topics"] || []
    @diagnostic_intro = data.dig("diagnostic", "intro")
    @diagnostic_bank = data.dig("diagnostic", "bank").map do |q|
      DiagnosticQuestion.new(id: q["id"], concept: q["concept"], stage: q["stage"], prompt: q["prompt"], figure: q["figure"],
                             options: q["options"].map { |o| DiagnosticOption.new(id: o["id"], text: o["text"]) },
                             answer: q["answer"])
    end
    validate!
  end

  def concept(id) = @concepts.find { |c| c.id == id } || raise(KeyError, "Unknown concept #{id}")
  def level(id) = @levels.find { |l| l.id == id } || raise(KeyError, "Unknown level #{id}")
  def level?(id) = @levels.any? { |l| l.id == id }
  def check(id) = @checks.fetch(id)

  # The diagnostic a student sees: one question per required concept per stage 1-3,
  # picked from the stage's pool by a stable hash of the student id (same questions
  # on reload, different students see different questions).
  def diagnostic_for(student_id)
    @required_concepts.flat_map do |cid|
      (1..3).filter_map do |stage|
        pool = @diagnostic_bank.select { |q| q.concept == cid && q.stage == stage }
        pool[Digest::SHA256.hexdigest("#{student_id}:#{cid}:#{stage}").to_i(16) % pool.size] if pool.any?
      end
    end
  end

  private

  def validate!
    ids = @concepts.map(&:id)
    (@required_concepts - ids).each { |c| raise ArgumentError, "Required concept #{c} not defined" }
    @levels.each do |l|
      l.transitions.each do |t|
        raise ArgumentError, "#{l.code}: unknown concept #{t.concept}" unless ids.include?(t.concept)
        t.checks.each { |c| raise ArgumentError, "#{l.code}: unknown check #{c}" unless @checks.key?(c) }
      end
    end
    (@fallback_sequence + [@project_level_id]).each { |id| level(id) }
  end
end
