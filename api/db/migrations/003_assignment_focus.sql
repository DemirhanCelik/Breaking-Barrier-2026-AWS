-- Skill-focus assignments: a teacher asks the adaptive engine to prioritize one
-- concept for a student, group, or class (target_kind 'concept', concept_id).
-- Also an optional due date and a group label ("Accessibility group" from
-- Insights). One idempotent statement for PostgreSQL and the Aurora Data API.
DO $focus$
BEGIN
  ALTER TABLE assignment ADD COLUMN IF NOT EXISTS concept_id text;
  ALTER TABLE assignment ADD COLUMN IF NOT EXISTS due_on date;
  ALTER TABLE assignment ADD COLUMN IF NOT EXISTS group_label text;

  ALTER TABLE assignment DROP CONSTRAINT IF EXISTS assignment_target_kind_check;
  ALTER TABLE assignment DROP CONSTRAINT IF EXISTS assignment_check1;
  ALTER TABLE assignment DROP CONSTRAINT IF EXISTS assignment_target_kind_ok;
  ALTER TABLE assignment DROP CONSTRAINT IF EXISTS assignment_target_shape_ok;
  ALTER TABLE assignment ADD CONSTRAINT assignment_target_kind_ok
    CHECK (target_kind IN ('unit', 'level', 'concept'));
  ALTER TABLE assignment ADD CONSTRAINT assignment_target_shape_ok
    CHECK ((target_kind = 'unit' AND level_code IS NULL AND concept_id IS NULL)
        OR (target_kind = 'level' AND level_code IS NOT NULL AND concept_id IS NULL)
        OR (target_kind = 'concept' AND concept_id IS NOT NULL AND level_code IS NULL));
END
$focus$
