/**
 * API contract between the React SPA and the Rails app tier (design §4, §5, §11).
 *
 * Student DTOs deliberately have NO stage, score, placement, rubric, or peer
 * fields (BRD FR13, Tenet 4). Stage data only appears in the Teacher* types,
 * which are served only by teacher-scoped endpoints.
 */

export type Role = 'student' | 'teacher';
export type ConceptId = string;
export type Stage = 0 | 1 | 2 | 3;
export type StageVector = Record<ConceptId, Stage>;

export interface SessionUser {
  id: string;
  displayName: string;
  role: Role;
}

// ---------------------------------------------------------------------------
// Student-facing (GET/POST /api/student/...)
// ---------------------------------------------------------------------------

export interface DiagnosticOption {
  id: string;
  text: string;
}

export interface DiagnosticItem {
  id: string;
  prompt: string;
  options: DiagnosticOption[];
}

export interface DiagnosticForm {
  intro: string;
  items: DiagnosticItem[];
}

/** itemId -> optionId */
export type DiagnosticAnswers = Record<string, string>;

export interface StudentLevel {
  id: string;
  kind: 'task' | 'project';
  /** Titled by what the student makes; never by difficulty tier. */
  title: string;
  intro: string;
  instructions: string[];
  /** Optional AI-generated artifact the student reviews (authored, pre-approved). */
  aiOutput?: string;
  responseLabel: string;
  responsePlaceholder: string;
}

export type PathItemStatus = 'done' | 'current' | 'upcoming';

export interface PathItem {
  levelId: string;
  title: string;
  status: PathItemStatus;
}

export interface DepthOption {
  /** Concept id to extend, or 'project'. */
  id: string;
  label: string;
  description: string;
}

export type LessonState =
  | { phase: 'diagnostic' }
  | {
      phase: 'level';
      level: StudentLevel;
      path: PathItem[];
      stepsCompleted: number;
    }
  | {
      phase: 'choose-depth';
      options: DepthOption[];
      path: PathItem[];
      stepsCompleted: number;
    }
  | { phase: 'complete'; stepsCompleted: number; message: string };

export interface SubmitResult {
  submissionId: string;
}

export type SubmissionOutcome =
  | { status: 'checking' }
  /** Content filter withheld the input or output (fail-closed, NFR1). */
  | { status: 'withheld'; message: string }
  | {
      status: 'done';
      /** Formative next action. Never a score or pass/fail label. */
      nextAction: 'continue' | 'revise';
      coaching: string;
      offerAssistant: boolean;
    };

export interface AssistantReply {
  reply: string;
  withheld: boolean;
}

// ---------------------------------------------------------------------------
// Teacher-facing (GET /api/teacher/...) - teacher group + class ownership only
// ---------------------------------------------------------------------------

export interface TeacherConcept {
  id: ConceptId;
  name: string;
  csta: string;
  descriptors: Record<Stage, string>;
}

export type AttainmentStatus =
  | 'not-started'
  | 'on-track'
  | 'needs-attention'
  | 'fallback'
  | 'met-bar'
  | 'complete';

export interface StudentAttainment {
  studentId: string;
  displayName: string;
  status: AttainmentStatus;
  stages: StageVector;
  diagnostic: StageVector | null;
  flags: string[];
  stepsCompleted: number;
}

export interface ClassAttainment {
  classId: string;
  className: string;
  bar: Stage;
  concepts: TeacherConcept[];
  students: StudentAttainment[];
}

export interface RouteDecision {
  at: string;
  levelCode: string;
  levelTitle: string;
  /** Human-readable rule that produced this decision (NFR4 auditability). */
  rule: string;
  vector: StageVector;
}

export interface ValidationConceptResult {
  conceptId: ConceptId;
  fromStage: Stage;
  targetStage: Stage;
  observedStage: Stage;
  passed: boolean;
  evidence: string[];
}

export interface ValidationRecord {
  at: string;
  levelCode: string;
  mode: 'adaptive' | 'fallback' | 'error' | 'withheld';
  results: ValidationConceptResult[];
}

export interface RoadmapStep {
  levelCode: string;
  title: string;
  targets: ConceptId[];
}

export interface StudentTrace extends StudentAttainment {
  bar: Stage;
  concepts: TeacherConcept[];
  roadmap: RoadmapStep[];
  decisions: RouteDecision[];
  validations: ValidationRecord[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
