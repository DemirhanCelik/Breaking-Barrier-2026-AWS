# A unit's concept matrix, admin-uploadable and DB-backed (one row per unit).
# Holds the assessment scaffolding the engine needs: concepts + their stage 0-3
# descriptors, the required-concept list, and the bar. When a row exists for a
# unit, Curriculum overlays it in place of the YAML `concepts`/`required_concepts`
# /`bar`. Lesson levels/prose remain version-controlled YAML.
#
# concepts_json shape: [{ "id", "name", "order", "csta", "descriptors": {"0":..,"1":..,"2":..,"3":..} }]
# required_json shape:  ["c1", "c2", ...]
class UnitMatrix
  class Error < StandardError
    attr_reader :status
    def initialize(message, status = 422)
      super(message)
      @status = status
    end
  end

  attr_reader :unit_id, :bar, :required, :concepts, :source_name, :created_by, :updated_at

  def initialize(row)
    @unit_id = row["unit_id"]
    @bar = row["bar"].to_i
    @required = row["required_json"]
    @concepts = row["concepts_json"]
    @source_name = row["source_name"]
    @created_by = row["created_by"]
    @updated_at = row["updated_at"]
  end

  def self.find(unit_id)
    row = Db.query("SELECT * FROM unit_matrix WHERE unit_id = :u AND status = 'active'", u: unit_id.to_s).first
    row && new(row)
  end

  # Validate a proposed matrix payload (from the admin after reviewing the AI
  # extraction). Returns the normalized {bar, required, concepts}. Raises Error.
  def self.normalize!(bar:, required:, concepts:)
    bar = Integer(bar) rescue raise(Error, "bar must be an integer")
    raise Error, "bar must be 1, 2, or 3" unless (1..3).cover?(bar)

    concepts = Array(concepts)
    raise Error, "at least one concept is required" if concepts.empty?
    raise Error, "at most 12 concepts" if concepts.size > 12

    norm_concepts = concepts.each_with_index.map do |c, i|
      c = (c || {}).transform_keys(&:to_s)
      id = c["id"].to_s.strip
      raise Error, "each concept needs an id" if id.empty?
      raise Error, "concept id #{id.inspect} must be a short slug (letters, digits, _ or -)" unless id.match?(/\A[a-z0-9_-]{1,40}\z/i)
      name = c["name"].to_s.strip
      raise Error, "concept #{id} needs a name" if name.empty?
      desc = (c["descriptors"] || {}).transform_keys(&:to_s)
      (0..3).each do |st|
        raise Error, "concept #{id} is missing the stage #{st} descriptor" if desc[st.to_s].to_s.strip.empty?
      end
      { "id" => id, "name" => name, "order" => (c["order"] || i + 1).to_i,
        "csta" => c["csta"].to_s.strip.presence,
        "descriptors" => (0..3).to_h { |st| [st.to_s, desc[st.to_s].to_s.strip] } }.compact
    end

    ids = norm_concepts.map { |c| c["id"] }
    raise Error, "duplicate concept ids: #{ids.tally.select { |_, n| n > 1 }.keys.join(', ')}" if ids.uniq.size != ids.size

    required = Array(required).map(&:to_s).uniq
    raise Error, "required_concepts cannot be empty" if required.empty?
    missing = required - ids
    raise Error, "required_concepts reference unknown ids: #{missing.join(', ')}" if missing.any?

    { bar: bar, required: required, concepts: norm_concepts }
  end

  # Create or replace (one row per unit) the matrix for a unit.
  def self.upsert!(unit_id:, created_by:, bar:, required:, concepts:, source_name: nil)
    unit_id = unit_id.to_s.strip
    raise Error, "unit_id is required" if unit_id.empty?
    raise Error, "unit_id must be a short slug" unless unit_id.match?(/\A[a-z0-9_-]{1,60}\z/i)
    n = normalize!(bar: bar, required: required, concepts: concepts)

    # Compatibility guard: if this unit already has levels (a YAML unit), every
    # concept its level transitions reference must exist in the new matrix and be
    # required — otherwise the overlay would break the engine's routing/validation
    # at load time. Reject the save instead of bricking the unit. A brand-new unit
    # id (no YAML) has no levels yet, so there is nothing to check.
    if Curriculum.unit_ids.include?(unit_id)
      used = Curriculum.yaml_transition_concepts(unit_id)
      ids = n[:concepts].map { |c| c["id"] }
      missing = used - ids
      raise Error, "This unit's lessons use concept(s) #{missing.join(', ')}, which are not in the uploaded matrix. " \
                   "Include them (the lesson levels reference them) or the unit's steps cannot be scored." if missing.any?
      not_required = used - n[:required]
      raise Error, "Concept(s) #{not_required.join(', ')} are used by lessons but not marked required. Add them to required concepts." if not_required.any?
    end

    Db.execute(<<~SQL, u: unit_id, bar: n[:bar], req: Db.json(n[:required]), con: Db.json(n[:concepts]), src: source_name.to_s[0, 200].presence, by: created_by)
      INSERT INTO unit_matrix (unit_id, bar, required_json, concepts_json, source_name, status, created_by, updated_at)
      VALUES (:u, :bar, CAST(:req AS jsonb), CAST(:con AS jsonb), :src, 'active', :by, now())
      ON CONFLICT (unit_id) DO UPDATE SET
        bar = EXCLUDED.bar, required_json = EXCLUDED.required_json, concepts_json = EXCLUDED.concepts_json,
        source_name = EXCLUDED.source_name, status = 'active', created_by = EXCLUDED.created_by, updated_at = now()
    SQL
    Curriculum.invalidate!(unit_id)
    find(unit_id)
  end

  def to_json_dto
    { unitId: unit_id, bar: bar, requiredConcepts: required, concepts: concepts,
      sourceName: source_name, createdBy: created_by, updatedAt: updated_at }.compact
  end
end
