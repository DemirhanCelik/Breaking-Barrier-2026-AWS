/**
 * HTTP client for the Rails API tier (api/).
 *
 * Auth:
 *  - Cognito: pass a TokenProvider that returns the Cognito ID token; it is sent
 *    as a Bearer JWT (design §11).
 *  - Demo: when the backend runs with AUTH_MODE=demo, the chosen synthetic user
 *    id is sent as X-Demo-User. Synthetic data only.
 */
import type { ApiClient, DemoControls } from './client';
import {
  ApiError,
  type AssistantReply,
  type ClassAttainment,
  type DiagnosticAnswers,
  type DiagnosticForm,
  type FilterAudit,
  type LessonState,
  type SessionUser,
  type StudentTrace,
  type SubmissionOutcome,
  type SubmitResult,
} from './types';

export type TokenProvider = () => Promise<string | null>;

const DEMO_USER_KEY = 'codeai-demo-user';

export class HttpApiClient implements ApiClient, DemoControls {
  readonly mode = 'http' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly getToken: TokenProvider = async () => null,
  ) {}

  private demoUser(): string | null {
    try {
      return localStorage.getItem(DEMO_USER_KEY);
    } catch {
      return null;
    }
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const token = await this.getToken();
    const demoUser = this.demoUser();
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(!token && demoUser ? { 'X-Demo-User': demoUser } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
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

  getLessonState() {
    return this.request<LessonState>('GET', '/api/student/lesson');
  }
  getDiagnostic() {
    return this.request<DiagnosticForm>('GET', '/api/student/diagnostic');
  }
  submitDiagnostic(answers: DiagnosticAnswers) {
    return this.request<LessonState>('POST', '/api/student/diagnostic', { answers });
  }
  submitWork(levelId: string, response: string) {
    return this.request<SubmitResult>('POST', `/api/student/levels/${encodeURIComponent(levelId)}/submissions`, { response });
  }
  getSubmission(submissionId: string) {
    return this.request<SubmissionOutcome>('GET', `/api/student/submissions/${encodeURIComponent(submissionId)}`);
  }
  chooseDepth(optionId: string) {
    return this.request<LessonState>('POST', '/api/student/depth', { optionId });
  }
  askAssistant(levelId: string, message: string) {
    return this.request<AssistantReply>('POST', `/api/student/levels/${encodeURIComponent(levelId)}/assistant`, { message });
  }

  getClassAttainment() {
    return this.request<ClassAttainment>('GET', '/api/teacher/class');
  }
  getStudentTrace(studentId: string) {
    return this.request<StudentTrace>('GET', `/api/teacher/students/${encodeURIComponent(studentId)}`);
  }
  getFilterAudit() {
    return this.request<FilterAudit>('GET', '/api/teacher/safety');
  }

  // Demo controls (backend AUTH_MODE=demo only)
  async getFaultInjection() {
    return (await this.request<{ on: boolean }>('GET', '/api/demo/fault')).on;
  }
  async setFaultInjection(on: boolean) {
    await this.request('POST', '/api/demo/fault', { on });
  }
  async resetDemo() {
    await this.request('POST', '/api/demo/reset', {});
  }
}
