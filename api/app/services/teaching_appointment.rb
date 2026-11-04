# Teaching appointments (admin-created). AUTHORITATIVE for teacher progress
# visibility: a teacher may see a student's progress for a unit ONLY if an
# appointment (teacher, student, unit) exists. Class ownership alone grants
# nothing here. Admins create/remove appointments; teachers only read the ones
# that name them.
class TeachingAppointment
  class Error < StandardError
    attr_reader :status
    def initialize(message, status = 422)
      super(message)
      @status = status
    end
  end

  # --- the authority check the teacher reads rely on -----------------------

  # True iff this teacher is appointed to this student for this unit.
  def self.allows?(teacher_id:, student_id:, unit_id:)
    Db.query(<<~SQL, t: teacher_id, s: student_id, u: unit_id).any?
      SELECT 1 FROM teaching_appointment
      WHERE teacher_id = :t AND student_id = :s AND unit_id = :u LIMIT 1
    SQL
  end

  # Student ids this teacher is appointed to for a given unit (the roster the
  # teacher may see for that unit).
  def self.student_ids_for(teacher_id:, unit_id:)
    Db.query(<<~SQL, t: teacher_id, u: unit_id).map { |r| r["student_id"] }
      SELECT student_id FROM teaching_appointment
      WHERE teacher_id = :t AND unit_id = :u ORDER BY student_id
    SQL
  end

  # Units this teacher is appointed for (any student), for the teacher's unit picker.
  def self.unit_ids_for(teacher_id:)
    Db.query("SELECT DISTINCT unit_id FROM teaching_appointment WHERE teacher_id = :t ORDER BY unit_id", t: teacher_id)
      .map { |r| r["unit_id"] }
  end

  # --- admin management ----------------------------------------------------

  def self.create!(created_by:, teacher_id:, student_id:, unit_id:)
    teacher_id = teacher_id.to_s
    student_id = student_id.to_s
    unit_id = unit_id.to_s
    raise Error, "teacher_id, student_id and unit_id are required" if [teacher_id, student_id, unit_id].any?(&:empty?)
    raise Error, "Unknown unit #{unit_id}" unless Curriculum.unit_ids.include?(unit_id)

    t = Db.query("SELECT role FROM app_user WHERE id = :id", id: teacher_id).first
    raise Error.new("Teacher not found", 404) unless t
    raise Error, "#{teacher_id} is not a teacher" unless t["role"] == "teacher"
    s = Db.query("SELECT role FROM app_user WHERE id = :id", id: student_id).first
    raise Error.new("Student not found", 404) unless s
    raise Error, "#{student_id} is not a student" unless s["role"] == "student"

    Db.execute(<<~SQL, t: teacher_id, s: student_id, u: unit_id, by: created_by)
      INSERT INTO teaching_appointment (teacher_id, student_id, unit_id, created_by)
      VALUES (:t, :s, :u, :by)
      ON CONFLICT (teacher_id, student_id, unit_id) DO NOTHING
    SQL
    { teacherId: teacher_id, studentId: student_id, unitId: unit_id }
  end

  def self.remove!(teacher_id:, student_id:, unit_id:)
    Db.execute(<<~SQL, t: teacher_id, s: student_id, u: unit_id)
      DELETE FROM teaching_appointment WHERE teacher_id = :t AND student_id = :s AND unit_id = :u
    SQL
    { teacherId: teacher_id, studentId: student_id, unitId: unit_id, removed: true }
  end

  # All appointments, newest first (admin view), with display names joined in.
  def self.all
    Db.query(<<~SQL).map do |r|
      SELECT a.teacher_id, a.student_id, a.unit_id, a.created_by,
             t.display_name AS teacher_name, s.display_name AS student_name,
             CAST(floor(extract(epoch FROM a.created_at) * 1000) AS bigint) AS at_ms
      FROM teaching_appointment a
      JOIN app_user t ON t.id = a.teacher_id
      JOIN app_user s ON s.id = a.student_id
      ORDER BY a.created_at DESC LIMIT 1000
    SQL
      { teacherId: r["teacher_id"], teacherName: r["teacher_name"], studentId: r["student_id"],
        studentName: r["student_name"], unitId: r["unit_id"], createdBy: r["created_by"],
        createdAt: StudentRecord.iso(r["at_ms"]) }
    end
  end
end
