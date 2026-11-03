-- CodeAI adaptive engine schema (Aurora PostgreSQL, design §5).
-- Idempotent: safe to run on every deploy. jsonb columns end in `_json`
-- (the Data API driver relies on that naming).
--
-- Curriculum (concepts, descriptors, levels, probes) is authored content kept
-- in config/curriculum/*.yml under version control for T&L review, not in
-- these tables, for the MVP.

CREATE TABLE IF NOT EXISTS app_user (
  id            text PRIMARY KEY,
  cognito_sub   text UNIQUE,
  display_name  text NOT NULL,
  role          text NOT NULL CHECK (role IN ('student', 'teacher')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS klass (
  id             text PRIMARY KEY,
  teacher_id     text NOT NULL REFERENCES app_user(id),
  name           text NOT NULL,
  bar_stage      integer NOT NULL DEFAULT 2,
  duration_days  integer NOT NULL DEFAULT 90
);

CREATE TABLE IF NOT EXISTS enrollment (
  student_id  text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  klass_id    text NOT NULL REFERENCES klass(id) ON DELETE CASCADE,
  PRIMARY KEY (student_id, klass_id)
);

-- Engine state per student (mode, current level, per-level attempts, flags).
CREATE TABLE IF NOT EXISTS student_progress (
  student_id              text PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  mode                    text NOT NULL DEFAULT 'adaptive' CHECK (mode IN ('adaptive', 'fallback')),
  current_level_id        text,
  depth_choice            text,
  complete                boolean NOT NULL DEFAULT false,
  level_status_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_order_json    jsonb NOT NULL DEFAULT '[]'::jsonb,
  transition_fails_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_response_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  flags_json              jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- The mastery vector. Teacher-scoped endpoints only.
CREATE TABLE IF NOT EXISTS mastery_state (
  student_id     text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  concept_id     text NOT NULL,
  current_stage  integer NOT NULL CHECK (current_stage BETWEEN 0 AND 3),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, concept_id)
);

CREATE TABLE IF NOT EXISTS diagnostic_result (
  student_id    text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  concept_id    text NOT NULL,
  placed_stage  integer NOT NULL CHECK (placed_stage BETWEEN 0 AND 3),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, concept_id)
);

CREATE TABLE IF NOT EXISTS submission (
  id            text PRIMARY KEY,
  student_id    text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  level_id      text NOT NULL,
  content       text,
  outcome_json  jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS submission_student_idx ON submission (student_id, created_at);

-- One row per validation run; per-concept results in results_json.
CREATE TABLE IF NOT EXISTS validation_result (
  id               bigserial PRIMARY KEY,
  submission_id    text REFERENCES submission(id) ON DELETE CASCADE,
  student_id       text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  level_code       text NOT NULL,
  mode             text NOT NULL CHECK (mode IN ('adaptive', 'fallback', 'error', 'withheld')),
  results_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_meta_json  jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS validation_student_idx ON validation_result (student_id, created_at);

-- Every routing decision with the rule and vector used (NFR4 auditability).
CREATE TABLE IF NOT EXISTS route_decision (
  id           bigserial PRIMARY KEY,
  student_id   text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  level_code   text NOT NULL,
  level_title  text NOT NULL,
  rule         text NOT NULL,
  vector_json  jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS route_student_idx ON route_decision (student_id, created_at);

-- Demo-only switches (e.g. fault injection for M6).
CREATE TABLE IF NOT EXISTS app_setting (
  key         text PRIMARY KEY,
  value_json  jsonb NOT NULL
);
