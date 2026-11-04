-- Apply with the schema Rake task, which also runs db/migrations/*.sql.
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

-- Filter audit log (BRD M7): one row per content-filter check; outcomes only, no text (NFR2).
CREATE TABLE IF NOT EXISTS filter_event (
  id          bigserial PRIMARY KEY,
  student_id  text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  context     text NOT NULL CHECK (context IN ('submission', 'assistant', 'coaching')),
  direction   text NOT NULL CHECK (direction IN ('input', 'output')),
  outcome     text NOT NULL CHECK (outcome IN ('pass', 'blocked', 'error')),
  source      text NOT NULL,
  ref_id      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS filter_event_ref_idx ON filter_event (ref_id);
CREATE INDEX IF NOT EXISTS filter_event_student_idx ON filter_event (student_id, created_at);

-- AI-assisted authoring bank (design §7B): drafts, review status, provenance, judge scores.
CREATE TABLE IF NOT EXISTS content_item (
  id              text PRIMARY KEY,
  concept         text NOT NULL,
  from_stage      smallint NOT NULL,
  to_stage        smallint NOT NULL,
  title           text NOT NULL,
  scenario        text NOT NULL,
  task            text NOT NULL,
  tip             text NOT NULL,
  status          text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  version         integer NOT NULL DEFAULT 1,
  source_title    text,
  source_quote    text,
  quote_verified  boolean NOT NULL DEFAULT false,
  quality_json    jsonb,
  filter_json     jsonb,
  reviewer_note   text,
  created_by      text NOT NULL,
  reviewed_by     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz
);
CREATE INDEX IF NOT EXISTS content_item_status_idx ON content_item (status, concept, from_stage);

-- Formative practice served to a student (design §7A). Never feeds the mastery signal.
CREATE TABLE IF NOT EXISTS practice_item (
  id               text PRIMARY KEY,
  student_id       text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  level_id         text NOT NULL,
  concept          text NOT NULL,
  from_stage       smallint NOT NULL,
  to_stage         smallint NOT NULL,
  title            text NOT NULL,
  scenario         text NOT NULL,
  task             text NOT NULL,
  tip              text NOT NULL,
  origin           text NOT NULL CHECK (origin IN ('generated', 'bank', 'authored')),
  content_item_id  text,
  fallback_reason  text,
  quality_json     jsonb,
  model_meta_json  jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS practice_item_student_idx ON practice_item (student_id, created_at);
CREATE TABLE IF NOT EXISTS practice_attempt (
  id           text PRIMARY KEY,
  practice_id  text NOT NULL REFERENCES practice_item(id) ON DELETE CASCADE,
  student_id   text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  content      text,
  feedback     text NOT NULL,
  withheld     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Migration: filter_event contexts are validated in FilterAudit (adds practice contexts).
ALTER TABLE filter_event DROP CONSTRAINT IF EXISTS filter_event_context_check;

-- Migration: AI routing advisor record per decision (proposal, rules choice, reason).
ALTER TABLE route_decision ADD COLUMN IF NOT EXISTS advisor_json jsonb;

-- Migration: quiet formative signals per submission (time on step, edit sessions, pastes).
ALTER TABLE submission ADD COLUMN IF NOT EXISTS signals_json jsonb;

-- Migrations: the student's chosen topic; which unit an authored item belongs to.
ALTER TABLE student_progress ADD COLUMN IF NOT EXISTS topic text;
ALTER TABLE content_item ADD COLUMN IF NOT EXISTS unit text;
