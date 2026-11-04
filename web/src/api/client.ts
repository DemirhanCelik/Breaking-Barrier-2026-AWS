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
  UnitInfo,
  CourseInfo,
  PreviewResult,
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
  Assignment,
  AssignableUnit,
  AdminDirectory,
  Appointment,
  CurriculumExtract,
  SavedCurriculum,
  UnitMatrix,
  MatrixConcept,
  Stage,
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
  selectCourse(courseId: string): Promise<LessonState>;
  getCourses(): Promise<CourseInfo[]>;
  getLessonState(): Promise<LessonState>;
  getDiagnostic(): Promise<DiagnosticForm>;
  submitDiagnostic(answers: DiagnosticAnswers): Promise<LessonState>;
  submitWork(levelId: string, response: string, signals?: WorkSignals): Promise<SubmitResult>;
  getSubmission(submissionId: string): Promise<SubmissionOutcome>;
  chooseDepth(optionId: string): Promise<LessonState>;
  /** Pick the topic that personalizes the lesson (before the diagnostic). */
  chooseTopic(topic: string): Promise<LessonState>;
  /** What an AI builds from the student's prompt; rendered in a sandboxed frame. */
  previewPrompt(levelId: string, prompt: string): Promise<PreviewResult>;
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

  // Teacher assignments (403 for student tokens)
  listAssignments(status?: string): Promise<{ assignments: Assignment[]; units: AssignableUnit[] }>;
  createAssignment(body: CreateAssignmentBody): Promise<Assignment>;
  archiveAssignment(id: string): Promise<Assignment>;

  // Approval queue (teacher OR admin)
  getReviewItems(status?: string): Promise<{ items: ContentItem[] }>;
  reviewItem(
    id: string,
    decision: 'approve' | 'reject',
    edits?: ContentEdits,
    note?: string,
  ): Promise<ContentItem>;

  // Admin directory + appointments (403 unless admin)
  getAdminDirectory(): Promise<AdminDirectory>;
  listAppointments(): Promise<{ appointments: Appointment[] }>;
  createAppointment(
    teacherId: string,
    studentId: string,
    unitId: string,
  ): Promise<{ teacherId: string; studentId: string; unitId: string }>;
  removeAppointment(
    teacherId: string,
    studentId: string,
    unitId: string,
  ): Promise<{ teacherId: string; studentId: string; unitId: string; removed: boolean }>;

  // Admin curriculum matrix (403 unless admin)
  extractCurriculum(unitId: string, file: File): Promise<CurriculumExtract>;
  saveCurriculum(body: SaveCurriculumBody): Promise<UnitMatrix>;
  getCurriculumMatrix(unitId: string): Promise<SavedCurriculum>;
}

/** Body for POST /api/teacher/assignments. */
export interface CreateAssignmentBody {
  scope: 'class' | 'student';
  targetKind: 'unit' | 'level';
  unitId: string;
  klassId?: string;
  studentId?: string;
  levelCode?: string;
  note?: string;
}

/** Body for POST /api/admin/curriculum. */
export interface SaveCurriculumBody {
  unitId: string;
  bar: Stage;
  required: string[];
  concepts: MatrixConcept[];
  sourceName?: string;
}

/** Demo-only controls: mock mode, or HTTP mode against a backend with AUTH_MODE=demo. */
export interface DemoControls {
  getFaultInjection(): Promise<boolean>;
  setFaultInjection(on: boolean): Promise<void>;
  /** AI-advised vs rules-only routing; `available` is false without a model (mock, probes mode). */
  getRoutingMode(): Promise<{ mode: 'advised' | 'rules'; available: boolean }>;
  setRoutingMode(mode: 'advised' | 'rules'): Promise<void>;
  /** The class's unit; switching reseeds the demo class. */
  getUnits(): Promise<{ current: string; units: UnitInfo[] }>;
  setUnit(unitId: string): Promise<void>;
  resetDemo(): Promise<void>;
}
