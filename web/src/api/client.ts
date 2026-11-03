import type {
  AssistantReply,
  ClassAttainment,
  DiagnosticAnswers,
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
  submitWork(levelId: string, response: string): Promise<SubmitResult>;
  getSubmission(submissionId: string): Promise<SubmissionOutcome>;
  chooseDepth(optionId: string): Promise<LessonState>;
  askAssistant(levelId: string, message: string): Promise<AssistantReply>;

  // Teacher-scoped: 403 for student tokens
  getClassAttainment(): Promise<ClassAttainment>;
  getStudentTrace(studentId: string): Promise<StudentTrace>;
}

/** Demo-only controls, available in mock mode. */
export interface DemoControls {
  getFaultInjection(): boolean;
  setFaultInjection(on: boolean): void;
  resetDemo(): void;
}
