# Teacher assignments: a teacher targets a unit or a specific level at a whole
# class or an individual student. Assignments PRIORITIZE (not force) the
# adaptive engine — see Engine.route, which boosts a matching level in the
# rule-approved candidate set. This is the repository + value object.
#
# Row shape (see schema.sql `assignment`):
#   scope='class'   -> klass_id set,  student_id null
#   scope='student' -> student_id set, klass_id null
#   target_kind='unit'  -> unit_id set, level_code null
#   target_kind='level' -> unit_id + level_code set
#   target_kind='concept' -> unit_id + concept_id set (skill focus: the engine
#                           prefers rule-approved levels that build this concept)
# Optional: due_on (date), group_label (e.g. a small group from Insights).
require "securerandom"

class Assignment
  class Error < StandardError
    attr_reader :status
    def initialize(message, status = 422)
      super(message)
      @status = status
    end
  end

  SCOPES = %w[class student].freeze
  KINDS  = %w[unit level concept].freeze

  attr_reader :id, :teacher_id, :scope, :klass_id, :student_id, :target_kind, :unit_id, :level_code, :status, :note, :created_at,
              :concept_id, :due_on, :group_label

  def initialize(row)
    @id = row["id"]
    @teacher_id = row["teacher_id"]
    @scope = row["scope"]
    @klass_id = row["klass_id"]
    @student_id = row["student_id"]
    @target_kind = row["target_kind"]
    @unit_id = row["unit_id"]
    @level_code = row["level_code"]
    @status = row["status"]
    @note = row["note"]
    @concept_id = row["concept_id"]
    @due_on = row["due_on"]&.to_s&.slice(0, 10)
    @group_label = row["group_label"]
    @created_at = row["at_ms"] ? StudentRecord.iso(row["at_ms"]) : row["created_at"]
  end

  TS = "CAST(floor(extract(epoch FROM created_at) * 1000) AS bigint) AS at_ms".freeze
  COLS = "id, teacher_id, scope, klass_id, student_id, target_kind, unit_id, level_code, concept_id, " \
         "CAST(due_on AS text) AS due_on, group_label, status, note, #{TS}".freeze

  # ---- writes -------------------------------------------------------------

  # Create an assignment. Validates scope/target consistency and that the
  # target (unit, and level if given) exists in the curriculum.
  def self.create!(teacher_id:, scope:, target_kind:, unit_id:, klass_id: nil, student_id: nil, level_code: nil, note: nil,
                   concept_id: nil, due_on: nil, group_label: nil)
    scope = scope.to_s
    target_kind = target_kind.to_s
    raise Error, "scope must be one of #{SCOPES.join(', ')}" unless SCOPES.include?(scope)
    raise Error, "target_kind must be one of #{KINDS.join(', ')}" unless KINDS.include?(target_kind)
    unit_id = unit_id.to_s
    raise Error, "unit_id is required" if unit_id.empty?
    raise Error, "Unknown unit #{unit_id}" unless Curriculum.unit_ids.include?(unit_id)

    if scope == "class"
      raise Error, "klass_id is required for a class assignment" if klass_id.to_s.empty?
      student_id = nil
    else
      raise Error, "student_id is required for a student assignment" if student_id.to_s.empty?
      klass_id = nil
    end

    if target_kind == "level"
      level_code = level_code.to_s
      raise Error, "level_code is required for a level assignment" if level_code.empty?
      # Validate the level exists in the named unit (not just the active one).
      unit = Curriculum.unit(unit_id)
      raise Error, "Unknown level #{level_code} in unit #{unit_id}" unless unit.levels.any? { |l| l.code == level_code }
    else
      level_code = nil
    end

    if target_kind == "concept"
      concept_id = concept_id.to_s
      raise Error, "concept_id is required for a skill-focus assignment" if concept_id.empty?
      raise Error, "Unknown skill #{concept_id} in unit #{unit_id}" unless Curriculum.unit(unit_id).concepts.any? { |c| c.id == concept_id }
    else
      concept_id = nil
    end

    due = nil
    if due_on.present?
      due = (Date.iso8601(due_on.to_s) rescue raise(Error, "due_on must be a date like 2026-11-14"))
    end

    id = SecureRandom.uuid
    sql = <<~SQL
      INSERT INTO assignment (id, teacher_id, scope, klass_id, student_id, target_kind, unit_id, level_code, concept_id, due_on, group_label, status, note)
      VALUES (:id, :t, :scope, :k, :s, :tk, :u, :lc, :c, CAST(:due AS date), :g, 'active', :note)
    SQL
    Db.execute(sql, id: id, t: teacher_id, scope: scope, k: klass_id, s: student_id, tk: target_kind, u: unit_id, lc: level_code,
                    c: concept_id, due: due&.iso8601, g: group_label.to_s.strip[0, 120].presence, note: note.to_s.strip[0, 2000].presence)
    find(id, teacher_id: teacher_id)
  end

  # Archive (soft-delete) an assignment the teacher owns. Idempotent.
  def self.archive!(id, teacher_id:)
    rows = Db.query(<<~SQL, id: id, t: teacher_id)
      UPDATE assignment SET status = 'archived'
      WHERE id = :id AND teacher_id = :t RETURNING #{COLS}
    SQL
    raise Error.new("Assignment not found", 404) if rows.empty?
    new(rows.first)
  end

  # One skill focus at a time: archive this teacher's earlier active focus for the
  # same student (or the same class) in the unit. Returns the archived ids.
  def self.archive_previous_focus!(teacher_id:, unit_id:, student_id: nil, klass_id: nil)
    target = student_id ? "student_id = :who AND scope = 'student'" : "klass_id = :who AND scope = 'class'"
    Db.query(<<~SQL, t: teacher_id, u: unit_id, who: student_id || klass_id).map { |r| r["id"] }
      UPDATE assignment SET status = 'archived'
      WHERE teacher_id = :t AND unit_id = :u AND target_kind = 'concept' AND status = 'active' AND #{target}
      RETURNING id
    SQL
  end

  # ---- reads --------------------------------------------------------------

  def self.find(id, teacher_id: nil)
    sql = "SELECT #{COLS} FROM assignment WHERE id = :id"
    params = { id: id }
    if teacher_id
      sql += " AND teacher_id = :t"
      params[:t] = teacher_id
    end
    row = Db.query(sql, **params).first
    row && new(row)
  end

  # All of a teacher's assignments, newest first. Optional status filter.
  def self.for_teacher(teacher_id, status: nil)
    sql = "SELECT #{COLS} FROM assignment WHERE teacher_id = :t"
    params = { t: teacher_id }
    if status
      sql += " AND status = :st"
      params[:st] = status
    end
    sql += " ORDER BY created_at DESC LIMIT 500"
    Db.query(sql, **params).map { |r| new(r) }
  end

  # Active assignments that apply to a given student: direct student assignments
  # plus class assignments for any class the student is enrolled in. This is the
  # lookup the engine uses to prioritize. Newest first (so the latest wins ties).
  def self.active_for_student(student_id)
    Db.query(<<~SQL, s: student_id).map { |r| new(r) }
      SELECT #{COLS} FROM assignment a
      WHERE a.status = 'active'
        AND (
          a.student_id = :s
          OR a.klass_id IN (SELECT klass_id FROM enrollment WHERE student_id = :s)
        )
      ORDER BY a.created_at DESC
      LIMIT 100
    SQL
  end

  # Active assignments that apply to a student AND target the currently-active
  # unit (the only unit the engine can serve levels from today). Direct student
  # assignments rank ahead of class-wide ones. Returns Assignment objects.
  def self.active_for_student_in_unit(student_id, unit_id)
    active_for_student(student_id)
      .select { |a| a.unit_id == unit_id }
      .sort_by { |a| a.scope == "student" ? 0 : 1 }
  end

  def to_json_dto
    { id: id, scope: scope, klassId: klass_id, studentId: student_id, targetKind: target_kind,
      unitId: unit_id, levelCode: level_code, conceptId: concept_id, dueOn: due_on, groupLabel: group_label,
      status: status, note: note, createdAt: created_at }.compact
  end
end
