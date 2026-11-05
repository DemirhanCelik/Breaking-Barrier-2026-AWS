/**
 * HTTP client for the Rails API tier (api/).
 *
 * Auth:
 *  - Cognito: pass a TokenProvider that returns the Cognito ID token; it is sent
 *    as a Bearer JWT (design §11).
 *  - Demo: when the backend runs with AUTH_MODE=demo, the chosen synthetic user
 *    id is sent as X-Demo-User. Synthetic data only.
 */
import type { ApiClient, CreateAssignmentBody, DemoControls, GroupFocusBody, SaveCurriculumBody } from './client';
import {
  ApiError,
  type AssistantReply,
  type ClassAttainment,
  type ClassInsights,
  type UnitInfo,
  type CourseInfo,
  type PreviewResult,
  type MiniLesson,
  type WorkSignals,
  type AuthoringState,
  type ContentEdits,
  type ContentItem,
  type DiagnosticForm,
  type DraftRequest,
  type DraftResult,
  type PracticeFeedback,
  type PracticeItem,
  type FilterAudit,
  type LessonState,
  type StudentProfile,
  type SessionUser,
  type StudentTrace,
  type ClassPaths,
  type SubmissionOutcome,
  type SubmitResult,
  type Assignment,
  type AssignmentsData,
  type AdminDirectory,
  type Appointment,
  type CurriculumExtract,
  type SavedCurriculum,
  type UnitMatrix,
} from './types';

export type TokenProvider = () => Promise<string | null>;
const noToken: TokenProvider = async () => null;

const DEMO_USER_KEY = 'codeai-demo-user';

export class HttpApiClient implements ApiClient, DemoControls {
  readonly mode = 'http' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly getToken: TokenProvider = noToken,
    private readonly getAgentToken: TokenProvider = noToken,
  ) {}

  private demoUser(): string | null {
    try {
      return localStorage.getItem(DEMO_USER_KEY);
    } catch {
      return null;
    }
  }

  /** Auth headers shared by JSON and multipart requests (Cognito Bearer or demo user). */
  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    const demoUser = this.demoUser();
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(!token && demoUser ? { 'X-Demo-User': demoUser } : {}),
    };
  }

  private async handle<T>(res: Response): Promise<T> {
    if (!res.ok) {
      let message = res.statusText;
      try {
        const data = (await res.json()) as { error?: string };
        if (data.error) message = data.error;
      } catch {
        // Non-JSON error body.
      }
      throw new ApiError(message, res.status);
    }
    return (await res.json()) as T;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(await this.authHeaders()),
        ...extraHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return this.handle<T>(res);
  }

  /**
   * Multipart POST for file uploads. Content-Type is intentionally omitted so the
   * browser sets the multipart boundary; auth headers are attached the same way.
   */
  private async requestForm<T>(path: string, form: FormData): Promise<T> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...(await this.authHeaders()),
      },
      body: form,
    });
    return this.handle<T>(res);
  }

  getSession() {
    return this.request<SessionUser>('GET', '/api/session').catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    });
  }
  /** Empty unless the backend runs with AUTH_MODE=demo. */
  listDemoUsers() {
    return this.request<SessionUser[]>('GET', '/api/demo/users').catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 404) return [] as SessionUser[];
      throw e;
    });
  }
  async signIn(userId: string): Promise<SessionUser> {
    localStorage.setItem(DEMO_USER_KEY, userId);
    const user = await this.getSession();
    if (!user) {
      localStorage.removeItem(DEMO_USER_KEY);
      throw new ApiError('Sign-in failed', 401);
    }
    return user;
  }
  async signOut() {
    localStorage.removeItem(DEMO_USER_KEY);
  }

  selectCourse(courseId: string) {
    return this.request<LessonState>('POST', '/api/student/course', { courseId });
  }
  getCourses() {
    return this.request<CourseInfo[]>('GET', '/api/student/courses');
  }
  getLessonState() {
    return this.request<LessonState>('GET', '/api/student/lesson');
  }
  getDiagnostic() {
    return this.request<DiagnosticForm>('GET', '/api/student/diagnostic');
  }
  submitDiagnostic(level: string) {
    return this.request<LessonState>('POST', '/api/student/diagnostic', { level });
  }
  getProfile() {
    return this.request<StudentProfile>('GET', '/api/student/profile');
  }
  submitWork(levelId: string, response: string, signals?: WorkSignals) {
    return this.request<SubmitResult>('POST', `/api/student/levels/${encodeURIComponent(levelId)}/submissions`, {
      response,
      signals,
    });
  }
  getInsights() {
    return this.request<ClassInsights>('GET', '/api/teacher/insights');
  }
  getMiniLesson(checkId: string) {
    return this.request<MiniLesson>('POST', '/api/teacher/insights/mini-lesson', { checkId });
  }
  getSubmission(submissionId: string) {
    return this.request<SubmissionOutcome>('GET', `/api/student/submissions/${encodeURIComponent(submissionId)}`);
  }
  previewPrompt(levelId: string, prompt: string) {
    return this.request<PreviewResult>('POST', `/api/student/levels/${encodeURIComponent(levelId)}/preview`, { prompt });
  }
  chooseTopic(topic: string) {
    return this.request<LessonState>('POST', '/api/student/topic', { topic });
  }
  chooseDepth(optionId: string) {
    return this.request<LessonState>('POST', '/api/student/depth', { optionId });
  }
  async askAssistant(levelId: string, message: string) {
    // The student's own access token lets the API call the AgentCore tutor on their behalf.
    const agentToken = await this.getAgentToken();
    return this.request<AssistantReply>(
      'POST',
      `/api/student/levels/${encodeURIComponent(levelId)}/assistant`,
      { message },
      agentToken ? { 'X-Agent-Token': agentToken } : {},
    );
  }

  getClassAttainment() {
    return this.request<ClassAttainment>('GET', '/api/teacher/class');
  }
  getClassPaths() {
    return this.request<ClassPaths>('GET', '/api/teacher/paths');
  }
  getStudentTrace(studentId: string) {
    return this.request<StudentTrace>('GET', `/api/teacher/students/${encodeURIComponent(studentId)}`);
  }
  getFilterAudit() {
    return this.request<FilterAudit>('GET', '/api/teacher/safety');
  }
  createPractice(levelId: string) {
    return this.request<PracticeItem>('POST', `/api/student/levels/${encodeURIComponent(levelId)}/practice`);
  }
  answerPractice(practiceId: string, response: string) {
    return this.request<PracticeFeedback>('POST', `/api/student/practice/${encodeURIComponent(practiceId)}/answers`, { response });
  }
  getAuthoring() {
    return this.request<AuthoringState>('GET', '/api/teacher/authoring');
  }
  draftContent(req: DraftRequest) {
    return this.request<DraftResult>('POST', '/api/teacher/authoring/drafts', req);
  }
  reviewContent(id: string, decision: 'approve' | 'reject', edits?: ContentEdits, note?: string) {
    return this.request<ContentItem>('POST', `/api/teacher/authoring/items/${encodeURIComponent(id)}/review`, {
      decision,
      edits,
      note,
    });
  }

  // Teacher assignments -----------------------------------------------------
  listAssignments(status?: string) {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<AssignmentsData>('GET', `/api/teacher/assignments${q}`);
  }
  createAssignment(body: CreateAssignmentBody) {
    return this.request<Assignment>('POST', '/api/teacher/assignments', body);
  }
  archiveAssignment(id: string) {
    return this.request<Assignment>('POST', `/api/teacher/assignments/${encodeURIComponent(id)}/archive`);
  }
  createGroupFocus(body: GroupFocusBody) {
    return this.request<{ assignments: Assignment[]; groupLabel: string }>('POST', '/api/teacher/assignments/group-focus', body);
  }

  // Approval queue (teacher or admin) ---------------------------------------
  getReviewItems(status = 'pending') {
    return this.request<{ items: ContentItem[] }>('GET', `/api/review/items?status=${encodeURIComponent(status)}`);
  }
  reviewItem(id: string, decision: 'approve' | 'reject', edits?: ContentEdits, note?: string) {
    return this.request<ContentItem>('POST', `/api/review/items/${encodeURIComponent(id)}/review`, {
      decision,
      edits,
      note,
    });
  }

  // Admin directory + appointments ------------------------------------------
  getAdminDirectory() {
    return this.request<AdminDirectory>('GET', '/api/admin/directory');
  }
  listAppointments() {
    return this.request<{ appointments: Appointment[] }>('GET', '/api/admin/appointments');
  }
  createAppointment(teacherId: string, studentId: string, unitId: string) {
    return this.request<{ teacherId: string; studentId: string; unitId: string }>('POST', '/api/admin/appointments', {
      teacherId,
      studentId,
      unitId,
    });
  }
  removeAppointment(teacherId: string, studentId: string, unitId: string) {
    return this.request<{ teacherId: string; studentId: string; unitId: string; removed: boolean }>(
      'POST',
      '/api/admin/appointments/remove',
      { teacherId, studentId, unitId },
    );
  }

  // Admin curriculum matrix -------------------------------------------------
  extractCurriculum(unitId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    form.append('unitId', unitId);
    return this.requestForm<CurriculumExtract>('/api/admin/curriculum/extract', form);
  }
  saveCurriculum(body: SaveCurriculumBody) {
    return this.request<UnitMatrix>('POST', '/api/admin/curriculum', body);
  }
  getCurriculumMatrix(unitId: string) {
    return this.request<SavedCurriculum>('GET', `/api/admin/curriculum/${encodeURIComponent(unitId)}`);
  }

  // Demo controls (backend AUTH_MODE=demo only)
  async getFaultInjection() {
    return (await this.request<{ on: boolean }>('GET', '/api/demo/fault')).on;
  }
  async setFaultInjection(on: boolean) {
    await this.request('POST', '/api/demo/fault', { on });
  }
  async getUnits() {
    return this.request<{ current: string; units: UnitInfo[] }>('GET', '/api/demo/units');
  }
  async setUnit(unitId: string) {
    await this.request('POST', '/api/demo/unit', { unit: unitId });
  }
  async getRoutingMode() {
    return this.request<{ mode: 'advised' | 'rules'; available: boolean }>('GET', '/api/demo/routing');
  }
  async setRoutingMode(mode: 'advised' | 'rules') {
    await this.request('POST', '/api/demo/routing', { mode });
  }
  async resetDemo() {
    await this.request('POST', '/api/demo/reset', {});
  }
}
