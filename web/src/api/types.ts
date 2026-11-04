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
  /** Optional text diagram shown with the question (for example a site map). */
  figure?: string;
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

/** Formative practice (POST /api/student/levels/:id/practice). Never affects the lesson path. */
export interface PracticeItem {
  id: string;
  title: string;
  scenario: string;
  task: string;
  tip: string;
  /** True when written by AI for this student (passed the safety filter and quality check). */
  aiGenerated: boolean;
}

export interface PracticeFeedback {
  feedback: string;
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

/** AI routing advisor record: what it proposed vs what the rules would pick. */
export interface RouteAdvisor {
  mode: 'advised';
  /** Level codes the rules allowed (the advisor must pick one of these). */
  candidates: string[];
  ruleChoice: string;
  proposed?: string;
  /** True when the advisor's pick was used. */
  accepted: boolean;
  /** True when the advisor picked the same level as the rules. */
  agreed?: boolean;
  /** Teacher-facing reason from the advisor. */
  reason?: string;
  /** Why the rules choice was used instead (off-list pick, model down, one candidate). */
  note?: string;
  latencyMs?: number;
}

export interface RouteDecision {
  at: string;
  levelCode: string;
  levelTitle: string;
  /** Human-readable rule that produced this decision (NFR4 auditability). */
  rule: string;
  vector: StageVector;
  advisor?: RouteAdvisor | null;
}

export interface ValidationConceptResult {
  conceptId: ConceptId;
  fromStage: Stage;
  targetStage: Stage;
  observedStage: Stage;
  passed: boolean;
  evidence: string[];
}

/** Quiet formative signals from the editor. Never shown to the student. */
export interface WorkSignals {
  timeOnTaskSec?: number;
  /** Separate bursts of editing (a pause of a few seconds starts a new one). */
  edits?: number;
  pastes?: number;
  pastedChars?: number;
}

export interface ValidationRecord {
  at: string;
  levelCode: string;
  mode: 'adaptive' | 'fallback' | 'error' | 'withheld';
  results: ValidationConceptResult[];
  signals?: WorkSignals | null;
}

// Teacher Insights (GET /api/teacher/insights)
export interface HelpNeeded {
  studentId: string;
  displayName: string;
  reasons: string[];
  levelCode: string | null;
  levelTitle: string | null;
}

export interface SkillGroup {
  checkId: string;
  skill: string;
  hint: string;
  conceptId: ConceptId;
  conceptName: string;
  students: { studentId: string; displayName: string }[];
}

export interface ClassInsights {
  needsHelp: HelpNeeded[];
  groups: SkillGroup[];
  concepts: { conceptId: ConceptId; name: string; byStage: number[] }[];
  bar: Stage;
}

export interface MiniLesson {
  title: string;
  skill: string;
  concept: string;
  goal: string;
  warmup: string;
  example: string;
  tryIt: string[];
  check: string;
  source: 'ai' | 'authored';
  note?: string;
}

export interface RoadmapStep {
  levelCode: string;
  title: string;
  targets: ConceptId[];
}

export interface QualityResult {
  passed: boolean;
  /** Curriculum-quality rubric scores, 1-4 per criterion (empty when only pre-checks ran). */
  scores: Record<string, number>;
  notes: string;
  prechecks: string[];
  judge: 'model' | 'skipped' | 'error';
}

export type PracticeOrigin = 'generated' | 'bank' | 'authored';

export interface PracticeRecord {
  id: string;
  at: string;
  levelCode: string;
  conceptId: ConceptId;
  fromStage: Stage;
  targetStage: Stage;
  title: string;
  origin: PracticeOrigin;
  /** Why live generation was not used (filter, judge, model, or fault). */
  fallbackReason: string | null;
  quality: QualityResult | null;
  attempts: number;
}

export interface StudentTrace extends StudentAttainment {
  bar: Stage;
  concepts: TeacherConcept[];
  roadmap: RoadmapStep[];
  decisions: RouteDecision[];
  validations: ValidationRecord[];
  /** Formative practice: excluded from the mastery signal and routing. */
  practice: PracticeRecord[];
}

// AI-assisted authoring (GET/POST /api/teacher/authoring...)
export type ContentStatus = 'pending' | 'approved' | 'rejected';

export interface ContentItem {
  id: string;
  conceptId: ConceptId;
  fromStage: Stage;
  targetStage: Stage;
  title: string;
  scenario: string;
  task: string;
  tip: string;
  status: ContentStatus;
  version: number;
  sourceTitle: string | null;
  /** Provenance: the passage of the source this draft is based on. */
  sourceQuote: string | null;
  /** True when the quote was found verbatim in the source. */
  quoteVerified: boolean;
  quality: QualityResult | null;
  filter: { ok: boolean; source: string; redactions?: number } | null;
  reviewerNote: string | null;
  createdBy: string;
  reviewedBy: string | null;
  at: string;
}

export interface BankSlot {
  conceptId: ConceptId;
  fromStage: Stage;
  targetStage: Stage;
  authored: number;
  approved: number;
}

export interface PracticeStats {
  generated: number;
  fromApprovedBank: number;
  fromAuthored: number;
  fellBack: number;
}

export interface AuthoringState {
  items: ContentItem[];
  bank: BankSlot[];
  practice: PracticeStats;
}

export interface DraftRequest {
  concept: ConceptId;
  fromStage: Stage;
  sourceTitle: string;
  sourceText: string;
  count: number;
}

export interface DraftResult {
  items: ContentItem[];
  redactions: number;
}

export type ContentEdits = Partial<Pick<ContentItem, 'title' | 'scenario' | 'task' | 'tip'>>;

// Filter audit log (GET /api/teacher/safety, BRD M7). Outcomes only, no text.
export type FilterContext = 'submission' | 'assistant' | 'coaching' | 'practice' | 'practice_answer';
export type FilterOutcome = 'pass' | 'blocked' | 'error';

export interface FilterCount {
  required: number;
  checked: number;
}

export interface FilterTotals extends FilterCount {
  blocked: number;
  errors: number;
}

export interface FilterEvent {
  at: string;
  studentId: string;
  displayName: string;
  context: FilterContext;
  direction: 'input' | 'output';
  outcome: FilterOutcome;
  source: string;
}

export interface FilterAudit {
  inputs: FilterTotals;
  outputs: FilterTotals;
  coverage: { submissions: FilterCount; coaching: FilterCount; assistantReplies: FilterCount; practice: FilterCount };
  bySource: { direction: 'input' | 'output'; outcome: FilterOutcome; source: string; count: number }[];
  recent: FilterEvent[];
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
