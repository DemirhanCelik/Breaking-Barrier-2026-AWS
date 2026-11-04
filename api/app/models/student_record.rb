# Repository for one student's adaptive state. Loads everything the engine
# needs, lets LessonService mutate it in memory, and writes it back.
class StudentRecord
  attr_reader :id, :display_name, :unit_id
  attr_accessor :mode, :stages, :level_status, :depth_choice, :diagnostic, :current_level_id,
                :completed_order, :complete, :flags, :transition_fails, :last_response, :topic

  # Epoch milliseconds (no colons in SQL literals, which the Data API could read as params).
  TS = "CAST(floor(extract(epoch FROM created_at) * 1000) AS bigint) AS at_ms"

  def self.iso(ms) = Time.at(ms.to_i / 1000.0).utc.iso8601(3)

  def self.find(id)
    user = Db.query("SELECT id, display_name FROM app_user WHERE id = :id AND role = 'student'", id: id).first
    user && new(user)
  end

  def self.all_in_class(klass_id)
    Db.query(<<~SQL, klass_id: klass_id).map { |u| new(u) }
      SELECT u.id, u.display_name FROM app_user u
      JOIN enrollment e ON e.student_id = u.id
      WHERE e.klass_id = :klass_id AND u.role = 'student'
      ORDER BY u.display_name
    SQL
  end

  def initialize(user_row)
    @unit_id = Curriculum.current.id
    @id = user_row["id"]
    @display_name = user_row["display_name"]
    load_state
  end

  # Engine view (see Engine docs).
  def engine_state
    { "mode" => mode, "stages" => stages, "level_status" => level_status, "depth_choice" => depth_choice }
  end

  def save!
    Db.execute(<<~SQL, **progress_params)
      INSERT INTO student_progress (student_id, unit_id, mode, current_level_id, depth_choice, complete,
        level_status_json, completed_order_json, transition_fails_json, last_response_json, flags_json, topic, updated_at)
      VALUES (:id, :unit, :mode, :current_level_id, :depth_choice, :complete,
        CAST(:level_status AS jsonb), CAST(:completed_order AS jsonb), CAST(:transition_fails AS jsonb),
        CAST(:last_response AS jsonb), CAST(:flags AS jsonb), :topic, now())
      ON CONFLICT (student_id, unit_id) DO UPDATE SET
        mode = EXCLUDED.mode, current_level_id = EXCLUDED.current_level_id, depth_choice = EXCLUDED.depth_choice,
        complete = EXCLUDED.complete, level_status_json = EXCLUDED.level_status_json,
        completed_order_json = EXCLUDED.completed_order_json, transition_fails_json = EXCLUDED.transition_fails_json,
        last_response_json = EXCLUDED.last_response_json, flags_json = EXCLUDED.flags_json, topic = EXCLUDED.topic,
        updated_at = now()
    SQL
    stages.each do |concept, stage|
      Db.execute(<<~SQL, id: id, unit: unit_id, concept: concept, stage: stage)
        INSERT INTO mastery_state (student_id, unit_id, concept_id, current_stage, updated_at)
        VALUES (:id, :unit, :concept, :stage, now())
        ON CONFLICT (student_id, unit_id, concept_id) DO UPDATE SET current_stage = EXCLUDED.current_stage, updated_at = now()
        WHERE mastery_state.current_stage <> EXCLUDED.current_stage
      SQL
    end
  end

  def save_diagnostic!(placed)
    placed.each do |concept, stage|
      Db.execute(<<~SQL, id: id, unit: unit_id, concept: concept, stage: stage)
        INSERT INTO diagnostic_result (student_id, unit_id, concept_id, placed_stage) VALUES (:id, :unit, :concept, :stage)
        ON CONFLICT (student_id, unit_id, concept_id) DO UPDATE SET placed_stage = EXCLUDED.placed_stage, created_at = now()
      SQL
    end
    self.diagnostic = placed.dup
  end

  def add_decision!(level_code:, level_title:, rule:, advisor: nil)
    Db.execute(<<~SQL, id: id, unit: unit_id, code: level_code, title: level_title, rule: rule, vector: Db.json(stages), adv: advisor && Db.json(advisor))
      INSERT INTO route_decision (student_id, unit_id, level_code, level_title, rule, vector_json, advisor_json)
      VALUES (:id, :unit, :code, :title, :rule, CAST(:vector AS jsonb), CAST(:adv AS jsonb))
    SQL
  end

  def add_validation!(level_code:, mode:, results: [], submission_id: nil, model_meta: nil)
    Db.execute(<<~SQL, id: id, unit: unit_id, sub: submission_id, code: level_code, mode: mode, results: Db.json(results), meta: model_meta && Db.json(model_meta))
      INSERT INTO validation_result (submission_id, student_id, unit_id, level_code, mode, results_json, model_meta_json)
      VALUES (:sub, :id, :unit, :code, :mode, CAST(:results AS jsonb), CAST(:meta AS jsonb))
    SQL
  end

  def create_submission!(sub_id, level_id, content, outcome, signals = nil)
    Db.execute(<<~SQL, sub: sub_id, id: id, unit: unit_id, level: level_id, content: content, outcome: Db.json(outcome), sig: signals.present? ? Db.json(signals) : nil)
      INSERT INTO submission (id, student_id, unit_id, level_id, content, outcome_json, signals_json)
      VALUES (:sub, :id, :unit, :level, :content, CAST(:outcome AS jsonb), CAST(:sig AS jsonb))
    SQL
  end

  def submission_outcome(sub_id)
    Db.query("SELECT outcome_json FROM submission WHERE id = :sub AND student_id = :id AND unit_id = :unit", sub: sub_id, id: id, unit: unit_id)
      .first&.fetch("outcome_json")
  end

  def decisions
    Db.query(<<~SQL, id: id, unit: unit_id)
      SELECT level_code, level_title, rule, vector_json, advisor_json, #{TS} FROM route_decision
      WHERE student_id = :id AND unit_id = :unit ORDER BY id DESC LIMIT 100
    SQL
  end

  def validations
    Db.query(<<~SQL, id: id, unit: unit_id)
      SELECT v.level_code, v.mode, v.results_json, s.signals_json, s.content AS response,
             CAST(floor(extract(epoch FROM v.created_at) * 1000) AS bigint) AS at_ms
      FROM validation_result v LEFT JOIN submission s ON s.id = v.submission_id
      WHERE v.student_id = :id AND v.unit_id = :unit ORDER BY v.id DESC LIMIT 100
    SQL
  end

  private

  def load_state
    row = Db.query("SELECT * FROM student_progress WHERE student_id = :id AND unit_id = :unit", id: id, unit: unit_id).first || {}
    @mode = row["mode"] || "adaptive"
    @current_level_id = row["current_level_id"]
    @depth_choice = row["depth_choice"]
    @complete = row["complete"] || false
    @level_status = row["level_status_json"] || {}
    @completed_order = row["completed_order_json"] || []
    @transition_fails = row["transition_fails_json"] || {}
    @last_response = row["last_response_json"] || {}
    @flags = row["flags_json"] || []
    @topic = row["topic"]

    @stages = Engine.zero_vector
    Db.query("SELECT concept_id, current_stage FROM mastery_state WHERE student_id = :id AND unit_id = :unit", id: id, unit: unit_id)
      .each { |r| @stages[r["concept_id"]] = r["current_stage"].to_i }
    diag = Db.query("SELECT concept_id, placed_stage FROM diagnostic_result WHERE student_id = :id AND unit_id = :unit", id: id, unit: unit_id)
    @diagnostic = diag.empty? ? nil : Engine.zero_vector.merge(diag.to_h { |r| [r["concept_id"], r["placed_stage"].to_i] })
  end

  def progress_params
    { id: id, unit: unit_id, mode: mode, current_level_id: current_level_id, depth_choice: depth_choice, complete: complete,
      level_status: Db.json(level_status), completed_order: Db.json(completed_order),
      transition_fails: Db.json(transition_fails), last_response: Db.json(last_response), flags: Db.json(flags),
      topic: topic }
  end
end
