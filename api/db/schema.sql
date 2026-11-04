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

-- Migration: allow an 'admin' role (approves AI content, uploads a unit's concept
-- matrix; never sees student progress). Re-create the CHECK to add the value.
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_role_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check CHECK (role IN ('student', 'teacher', 'admin'));

-- Teaching appointments (admin-created, AUTHORITATIVE for teacher visibility):
-- an admin appoints a teacher to a student for a specific unit/course. A teacher
-- may see a student's progress for a unit ONLY if such an appointment exists --
-- class ownership alone does not grant progress visibility.
CREATE TABLE IF NOT EXISTS teaching_appointment (
  teacher_id   text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  student_id   text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  unit_id      text NOT NULL,
  created_by   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, student_id, unit_id)
);
CREATE INDEX IF NOT EXISTS appointment_teacher_unit_idx ON teaching_appointment (teacher_id, unit_id);
CREATE INDEX IF NOT EXISTS appointment_student_idx ON teaching_appointment (student_id);

-- One concept matrix per unit (admin-uploadable): concepts + stage 0-3 descriptors,
-- required concepts, and the bar. Overlays the YAML `concepts` block when present.
CREATE TABLE IF NOT EXISTS unit_matrix (
  unit_id        text PRIMARY KEY,
  bar            smallint NOT NULL CHECK (bar BETWEEN 1 AND 3),
  required_json  jsonb NOT NULL,
  concepts_json  jsonb NOT NULL,
  source_name    text,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by     text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Teacher assignments: a teacher targets a unit or a specific level at either a
-- whole class or an individual student. Assignments PRIORITIZE (not force) the
-- adaptive engine's choice — a matching level is boosted to the top of the
-- rule-approved candidate set and the routing decision is logged as such.
--   scope='class'   -> klass_id set, student_id null
--   scope='student' -> student_id set, klass_id null
--   target_kind='unit'  -> unit_id set, level_code null
--   target_kind='level' -> unit_id + level_code both set
CREATE TABLE IF NOT EXISTS assignment (
  id           text PRIMARY KEY,
  teacher_id   text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  scope        text NOT NULL CHECK (scope IN ('class', 'student')),
  klass_id     text REFERENCES klass(id) ON DELETE CASCADE,
  student_id   text REFERENCES app_user(id) ON DELETE CASCADE,
  target_kind  text NOT NULL CHECK (target_kind IN ('unit', 'level')),
  unit_id      text NOT NULL,
  level_code   text,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'class' AND klass_id IS NOT NULL AND student_id IS NULL)
      OR (scope = 'student' AND student_id IS NOT NULL AND klass_id IS NULL)),
  CHECK ((target_kind = 'unit' AND level_code IS NULL)
      OR (target_kind = 'level' AND level_code IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS assignment_teacher_idx ON assignment (teacher_id, status);
CREATE INDEX IF NOT EXISTS assignment_student_idx ON assignment (student_id, status);
CREATE INDEX IF NOT EXISTS assignment_klass_idx ON assignment (klass_id, status);
