-- Teaching appointments are authoritative for teacher visibility, but databases
-- seeded before they existed have none, so teachers saw an empty class. Appoint
-- each class's teacher to its enrolled students for every selectable course and
-- any course a student already has progress in. Idempotent (ON CONFLICT).
INSERT INTO teaching_appointment (teacher_id, student_id, unit_id, created_by)
SELECT DISTINCT k.teacher_id, e.student_id, u.unit_id, 'migration-002'
FROM enrollment e
JOIN klass k ON k.id = e.klass_id
CROSS JOIN LATERAL (
  SELECT unnest(ARRAY['digital_magazine', 'debug_with_ai', 'intro_python']) AS unit_id
  UNION
  SELECT sp.unit_id FROM student_progress sp WHERE sp.student_id = e.student_id
) u
ON CONFLICT (teacher_id, student_id, unit_id) DO NOTHING
