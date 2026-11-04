import type {
  AssistantReply,
  AuthoringState,
  ContentEdits,
  ContentItem,
  DraftRequest,
  DraftResult,
  PracticeFeedback,
  PracticeItem,
  ClassAttainment,
  ClassInsights,
  MiniLesson,
  WorkSignals,
  DiagnosticAnswers,
  FilterAudit,
  DiagnosticForm,
  LessonState,
  SessionUser,
  StudentTrace,
  SubmissionOutcome,
  SubmitResult,
} from './types';

/**
 * Everything the SPA needs from the API tier. The mock and HTTP clients both
 * implement this, so swapping to the Rails API is configuration (VITE_API_MODE).
 */
export interface ApiClient {
  readonly mode: 'mock' | 'http';

  // Session (Cognito in the target architecture)
  getSession(): Promise<SessionUser | null>;
  listDemoUsers(): Promise<SessionUser[]>;
  signIn(userId: string): Promise<SessionUser>;
  signOut(): Promise<void>;

  // Student-scoped: responses never include stage, score, or placement
  getLessonState(): Promise<LessonState>;
  getDiagnostic(): Promise<DiagnosticForm>;
  submitDiagnostic(answers: DiagnosticAnswers): Promise<LessonState>;
  submitWork(levelId: string, response: string, signals?: WorkSignals): Promise<SubmitResult>;
  getSubmission(submissionId: string): Promise<SubmissionOutcome>;
  chooseDepth(optionId: string): Promise<LessonState>;
  askAssistant(levelId: string, message: string): Promise<AssistantReply>;
  /** Formative practice for the current level; never changes the lesson path. */
  createPractice(levelId: string): Promise<PracticeItem>;
  answerPractice(practiceId: string, response: string): Promise<PracticeFeedback>;

  // Teacher-scoped: 403 for student tokens
  getClassAttainment(): Promise<ClassAttainment>;
  getStudentTrace(studentId: string): Promise<StudentTrace>;
  getFilterAudit(): Promise<FilterAudit>;
  /** Who needs help now and small groups by shared gap (teacher-only). */
  getInsights(): Promise<ClassInsights>;
  getMiniLesson(checkId: string): Promise<MiniLesson>;
  // AI-assisted authoring: AI drafts, a human approves
  getAuthoring(): Promise<AuthoringState>;
  draftContent(req: DraftRequest): Promise<DraftResult>;
  reviewContent(id: string, decision: 'approve' | 'reject', edits?: ContentEdits, note?: string): Promise<ContentItem>;
}

/** Demo-only controls: mock mode, or HTTP mode against a backend with AUTH_MODE=demo. */
export interface DemoControls {
  getFaultInjection(): Promise<boolean>;
  setFaultInjection(on: boolean): Promise<void>;
  /** AI-advised vs rules-only routing; `available` is false without a model (mock, probes mode). */
  getRoutingMode(): Promise<{ mode: 'advised' | 'rules'; available: boolean }>;
  setRoutingMode(mode: 'advised' | 'rules'): Promise<void>;
  resetDemo(): Promise<void>;
}
