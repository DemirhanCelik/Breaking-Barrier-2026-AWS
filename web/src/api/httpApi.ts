/**
 * HTTP client for the Rails API tier. Endpoint paths are the proposed contract;
 * the Rails team should match them or update this file.
 *
 * Auth: sends the Cognito ID token as a Bearer JWT once Cognito is wired up
 * (design §11). Until then, getSession() returns null and sign-in is disabled.
 */
import type { ApiClient } from './client';
import {
  ApiError,
  type AssistantReply,
  type ClassAttainment,
  type DiagnosticAnswers,
  type DiagnosticForm,
  type LessonState,
  type SessionUser,
  type StudentTrace,
  type SubmissionOutcome,
  type SubmitResult,
} from './types';

export type TokenProvider = () => Promise<string | null>;

export class HttpApiClient implements ApiClient {
  readonly mode = 'http' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly getToken: TokenProvider = async () => null,
  ) {}

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const token = await this.getToken();
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  async listDemoUsers(): Promise<SessionUser[]> {
    return [];
  }
  async signIn(): Promise<SessionUser> {
    throw new ApiError('Sign-in goes through Cognito in HTTP mode.', 501);
  }
  async signOut() {
    // Cognito sign-out is handled by the auth library.
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
}
