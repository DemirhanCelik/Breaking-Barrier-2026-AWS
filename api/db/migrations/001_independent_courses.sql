-- Preserve the existing class's progress, then key all learning records by course.
-- One atomic, idempotent statement for both PostgreSQL and the Aurora Data API.
DO $courses$
DECLARE
  legacy_unit text;
  table_name text;
  expected_key text[];
  existing_key text[];
BEGIN
  SELECT value_json #>> '{}' INTO legacy_unit FROM app_setting WHERE key = 'unit';
  legacy_unit := COALESCE(NULLIF(legacy_unit, ''), 'digital_magazine');

  UPDATE content_item SET unit = legacy_unit WHERE unit IS NULL;

  ALTER TABLE app_user ADD COLUMN IF NOT EXISTS selected_unit_id text;

  FOREACH table_name IN ARRAY ARRAY['student_progress', 'mastery_state', 'diagnostic_result',
    'submission', 'validation_result', 'route_decision', 'practice_item', 'practice_attempt', 'filter_event']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS unit_id text', table_name);
    EXECUTE format('UPDATE %I SET unit_id = $1 WHERE unit_id IS NULL', table_name) USING legacy_unit;
    EXECUTE format('ALTER TABLE %I ALTER COLUMN unit_id SET DEFAULT %L', table_name, legacy_unit);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN unit_id SET NOT NULL', table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (unit_id, student_id)', table_name || '_course_student_idx', table_name);
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY['student_progress', 'mastery_state', 'diagnostic_result']
  LOOP
    expected_key := CASE WHEN table_name = 'student_progress'
      THEN ARRAY['student_id', 'unit_id'] ELSE ARRAY['student_id', 'unit_id', 'concept_id'] END;
    SELECT array_agg(a.attname::text ORDER BY k.ord) INTO existing_key
      FROM pg_constraint c CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      WHERE c.conrelid = table_name::regclass AND c.contype = 'p';
    IF existing_key IS DISTINCT FROM expected_key THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', table_name, table_name || '_pkey');
      IF table_name = 'student_progress' THEN
        EXECUTE format('ALTER TABLE %I ADD PRIMARY KEY (student_id, unit_id)', table_name);
      ELSE
        EXECUTE format('ALTER TABLE %I ADD PRIMARY KEY (student_id, unit_id, concept_id)', table_name);
      END IF;
    END IF;
  END LOOP;
END
$courses$;
