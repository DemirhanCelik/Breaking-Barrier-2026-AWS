/**
 * In-browser mock of the Rails API tier, persisted to localStorage.
 *
 * Mirrors the server-side guarantees from the design so the UI is built against
 * the real contract:
 *  - role checks: teacher endpoints throw 403 for student sessions (design §11)
 *  - student DTOs never carry stage/score/placement (FR13)
 *  - submit is accepted first, then polled for the result (design §6.2)
 *  - fault injection drops the student onto the non-adaptive path (FR10, M6)
 * All users and data are synthetic (NFR2).
 */
import type { ApiClient, DemoControls } from '../client';
import {
  ApiError,
  type AssistantReply,
  type AttainmentStatus,
  type ClassAttainment,
  type ClassInsights,
  type HelpNeeded,
  type MiniLesson,
  type SkillGroup,
  type WorkSignals,
  type DiagnosticAnswers,
  type AuthoringState,
  type ContentEdits,
  type ContentItem,
  type DiagnosticForm,
  type DraftRequest,
  type DraftResult,
  type PracticeFeedback,
  type PracticeItem,
  type PracticeRecord,
  type QualityResult,
  type Stage,
  type FilterAudit,
  type FilterContext,
  type FilterEvent,
  type LessonState,
  type PathItem,
  type RouteDecision,
  type SessionUser,
  type StageVector,
  type StudentAttainment,
  type StudentLevel,
  type StudentTrace,
  type SubmissionOutcome,
  type SubmitResult,
  type TeacherConcept,
  type ValidationRecord,
} from '../types';
import {
  CHECKS,
  CLASS_INFO,
  CONCEPTS,
  LEVELS,
  PROJECT_LEVEL_ID,
  REQUIRED_CONCEPTS,
  conceptById,
  levelById,
} from './curriculum';
import { PRACTICE_BANK, type BankItem } from './practiceBank';
import { DIAGNOSTIC_INTRO } from './diagnosticBank';
import {
  MAX_ATTEMPTS_PER_LEVEL,
  MAX_FAILS_PER_TRANSITION,
  applicableTransitions,
  belowBar,
  buildRoadmap,
  evaluate,
  filterText,
  diagnosticFor,
  placeFromDiagnostic,
  route,
  type EngineState,
} from './engine';

const STORAGE_KEY = 'codeai-adaptive-mock-v1';
const CHECKING_MS = 1200;

interface StoredOutcome {
  readyAt: number;
  outcome: SubmissionOutcome;
}

interface StudentRecord extends EngineState {
  id: string;
  displayName: string;
  diagnostic: StageVector | null;
  currentLevelId: string | null;
  completedOrder: string[];
  complete: boolean;
  decisions: RouteDecision[];
  validations: ValidationRecord[];
  flags: string[];
  transitionFails: Record<string, number>;
  lastResponse: Record<string, string>;
  submissions: Record<string, StoredOutcome>;
}

interface StoredFilterEvent extends Omit<FilterEvent, 'displayName'> {
  refId: string;
}

interface StoredPractice extends PracticeRecord {
  studentId: string;
  item: PracticeItem;
}

interface Store {
  sessionUserId: string | null;
  fault: boolean;
  students: Record<string, StudentRecord>;
  /** Formative practice served (optional so older saved stores still load). */
  practice?: Record<string, StoredPractice>;
  /** Authoring queue; survives demo reset like the API's content_item table. */
  content?: ContentItem[];
  /** Filter audit log (M7); optional so stores saved before it existed still load. */
  filterEvents?: StoredFilterEvent[];
}

const TEACHER: SessionUser = { id: 't-rivera', displayName: 'Ms. Rivera (teacher)', role: 'teacher' };

const STUDENT_NAMES: Record<string, string> = {
  's-ava': 'Ava M.',
  's-ben': 'Ben O.',
  's-chloe': 'Chloe P.',
  's-dev': 'Dev R.',
  's-eli': 'Eli S.',
  's-fay': 'Fay T.',
  's-gus': 'Gus W.',
};

const nowIso = () => new Date().toISOString();
const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

function newStudent(id: string): StudentRecord {
  return {
    id,
    displayName: STUDENT_NAMES[id],
    mode: 'adaptive',
    stages: Object.fromEntries(CONCEPTS.map((c) => [c.id, 0])) as StageVector,
    levelStatus: {},
    depthChoice: null,
    diagnostic: null,
    currentLevelId: null,
    completedOrder: [],
    complete: false,
    decisions: [],
    validations: [],
    flags: [],
    transitionFails: {},
    lastResponse: {},
    submissions: {},
  };
}

/** Run routing and apply its result to the student record. */
function advance(s: StudentRecord) {
  let r = route(s);
  if (r.kind === 'fallback') {
    s.mode = 'fallback';
    s.flags.push(`Moved to non-adaptive path: ${r.reason}`);
    s.decisions.push({
      at: nowIso(),
      levelCode: '-',
      levelTitle: 'Fallback',
      rule: `Fallback: ${r.reason}`,
      vector: { ...s.stages },
    });
    r = route(s);
  }
  if (r.kind === 'level') {
    if (s.currentLevelId !== r.levelId) {
      const lvl = levelById(r.levelId);
      s.decisions.push({ at: nowIso(), levelCode: lvl.code, levelTitle: lvl.title, rule: r.rule, vector: { ...s.stages } });
    }
    s.currentLevelId = r.levelId;
    s.levelStatus[r.levelId] ??= { attempts: 0, status: 'in-progress' };
  } else if (r.kind === 'choose-depth') {
    s.currentLevelId = null;
  } else {
    s.currentLevelId = null;
    s.complete = true;
  }
}

function closeLevel(s: StudentRecord, levelId: string, status: 'passed' | 'exhausted' | 'done') {
  s.levelStatus[levelId] = { attempts: s.levelStatus[levelId]?.attempts ?? 0, status };
  if (!s.completedOrder.includes(levelId)) s.completedOrder.push(levelId);
}

function placeStudent(s: StudentRecord, placed: StageVector) {
  s.diagnostic = { ...placed };
  s.stages = { ...placed };
  advance(s);
}

/** Seed helper: treat the current level as passed without a real submission. */
function simulatePasses(s: StudentRecord, count: number) {
  for (let i = 0; i < count && s.currentLevelId; i++) {
    const level = levelById(s.currentLevelId);
    const ts = applicableTransitions(level, s.stages);
    s.validations.push({
      at: nowIso(),
      levelCode: level.code,
      mode: 'adaptive',
      results: ts.map((t) => ({
        conceptId: t.concept,
        fromStage: t.from,
        targetStage: t.to,
        observedStage: t.to,
        passed: true,
        evidence: ['Seeded demo data'],
      })),
    });
    for (const t of ts) s.stages[t.concept] = t.to;
    closeLevel(s, level.id, 'passed');
    advance(s);
  }
}

function seed(): Store {
  const students: Record<string, StudentRecord> = {};
  for (const id of Object.keys(STUDENT_NAMES)) students[id] = newStudent(id);

  placeStudent(students['s-chloe'], { c1: 1, c2: 0, c3: 1, c4: 0 });
  simulatePasses(students['s-chloe'], 2);

  placeStudent(students['s-dev'], { c1: 2, c2: 2, c3: 2, c4: 2 });

  const eli = students['s-eli'];
  placeStudent(eli, { c1: 1, c2: 1, c3: 0, c4: 1 });
  simulatePasses(eli, 1);
  eli.validations.push({ at: nowIso(), levelCode: levelById(eli.currentLevelId!).code, mode: 'error', results: [] });
  eli.flags.push('Validation service unavailable (seeded fault).');
  closeLevel(eli, eli.currentLevelId!, 'done');
  eli.mode = 'fallback';
  eli.flags.push('Moved to non-adaptive path: validation failed after retry.');
  advance(eli);

  const fay = students['s-fay'];
  placeStudent(fay, { c1: 2, c2: 1, c3: 1, c4: 1 });
  fay.transitionFails['c3:1'] = 3;
  fay.levelStatus[fay.currentLevelId!] = { attempts: 1, status: 'in-progress' };

  placeStudent(students['s-gus'], { c1: 2, c2: 1, c3: 1, c4: 1 });

  return { sessionUserId: null, fault: false, students };
}

function load(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    // Corrupt or unavailable storage: reseed.
  }
  const fresh = seed();
  save(fresh);
  return fresh;
}

function save(store: Store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or blocked; the session keeps working in memory.
  }
}

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

function toStudentLevel(levelId: string): StudentLevel {
  const l = levelById(levelId);
  return {
    id: l.id,
    kind: l.kind,
    title: l.title,
    intro: l.intro,
    instructions: l.instructions,
    aiOutput: l.aiOutput,
    responseLabel: l.responseLabel,
    responsePlaceholder: l.responsePlaceholder,
  };
}

function studentPath(s: StudentRecord): PathItem[] {
  const done: PathItem[] = s.completedOrder.map((id) => ({ levelId: id, title: levelById(id).title, status: 'done' }));
  const current: PathItem[] = s.currentLevelId
    ? [{ levelId: s.currentLevelId, title: levelById(s.currentLevelId).title, status: 'current' }]
    : [];
  const seen = new Set([...s.completedOrder, s.currentLevelId]);
  const upcoming: PathItem[] = buildRoadmap(s)
    .steps.map((step) => levelIdForCode(step.levelCode))
    .filter((id) => !seen.has(id))
    .map((id) => ({ levelId: id, title: levelById(id).title, status: 'upcoming' }));
  return [...done, ...current, ...upcoming];
}

const levelIdForCode = (code: string) => code.toLowerCase();

function lessonState(s: StudentRecord): LessonState {
  if (!s.diagnostic) return { phase: 'diagnostic' };
  const stepsCompleted = s.completedOrder.length;
  if (s.complete) {
    return {
      phase: 'complete',
      stepsCompleted,
      message:
        s.mode === 'fallback'
          ? 'You worked through every step for today. Your teacher will pick up from here with you.'
          : 'You finished the lesson and built your own club page. Great work today.',
    };
  }
  if (s.currentLevelId) {
    return { phase: 'level', level: toStudentLevel(s.currentLevelId), path: studentPath(s), stepsCompleted };
  }
  const r = route(s);
  return {
    phase: 'choose-depth',
    options: r.kind === 'choose-depth' ? r.options : [],
    path: studentPath(s),
    stepsCompleted,
  };
}

function attainmentStatus(s: StudentRecord): AttainmentStatus {
  if (!s.diagnostic) return 'not-started';
  if (s.mode === 'fallback') return 'fallback';
  if (s.complete) return 'complete';
  if (belowBar(s.stages).length === 0) return 'met-bar';
  if (Object.values(s.transitionFails).some((n) => n >= 2)) return 'needs-attention';
  return 'on-track';
}

function toAttainment(s: StudentRecord): StudentAttainment {
  return {
    studentId: s.id,
    displayName: s.displayName,
    status: attainmentStatus(s),
    stages: { ...s.stages },
    diagnostic: s.diagnostic ? { ...s.diagnostic } : null,
    flags: [...s.flags],
    stepsCompleted: s.completedOrder.length,
  };
}

const teacherConcepts = (): TeacherConcept[] =>
  CONCEPTS.map((c) => ({ id: c.id, name: c.name, csta: c.csta, descriptors: c.descriptors }));

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class MockApiClient implements ApiClient, DemoControls {
  readonly mode = 'mock' as const;
  private store: Store = load();

  private persist() {
    save(this.store);
  }

  /** Mirrors api FilterAudit.record!: one row per filter check, outcome only. */
  private audit(
    studentId: string,
    context: FilterContext,
    direction: 'input' | 'output',
    refId: string,
    result: { ok: boolean },
  ) {
    (this.store.filterEvents ??= []).push({
      at: nowIso(),
      studentId,
      context,
      direction,
      outcome: result.ok ? 'pass' : 'blocked',
      source: 'local',
      refId,
    });
  }

  private user(): SessionUser | null {
    const id = this.store.sessionUserId;
    if (!id) return null;
    if (id === TEACHER.id) return TEACHER;
    const s = this.store.students[id];
    return s ? { id: s.id, displayName: s.displayName, role: 'student' } : null;
  }

  private requireStudent(): StudentRecord {
    const u = this.user();
    if (!u) throw new ApiError('Not signed in', 401);
    if (u.role !== 'student') throw new ApiError('Student endpoint', 403);
    return this.store.students[u.id];
  }

  private requireTeacher() {
    const u = this.user();
    if (!u) throw new ApiError('Not signed in', 401);
    if (u.role !== 'teacher') throw new ApiError('Forbidden: teacher-scoped endpoint', 403);
    return u;
  }

  // Session -----------------------------------------------------------------

  async getSession() {
    await delay(50);
    return this.user();
  }

  async listDemoUsers(): Promise<SessionUser[]> {
    await delay(50);
    return [
      TEACHER,
      ...Object.values(this.store.students).map((s) => ({ id: s.id, displayName: s.displayName, role: 'student' as const })),
    ];
  }

  async signIn(userId: string) {
    await delay();
    if (userId !== TEACHER.id && !this.store.students[userId]) throw new ApiError('Unknown user', 404);
    this.store.sessionUserId = userId;
    this.persist();
    return this.user()!;
  }

  async signOut() {
    await delay(50);
    this.store.sessionUserId = null;
    this.persist();
  }

  // Student -----------------------------------------------------------------

  async selectCourse(courseId: string) {
    if (courseId !== 'mock') throw new Error('Unknown course');
    return this.getLessonState();
  }
  async getCourses() {
    return [{ id: 'mock', name: 'Create with code & AI', summary: 'Explore and build with AI.', assigned: true }];
  }

  async getLessonState() {
    await delay();
    return lessonState(this.requireStudent());
  }

  async getDiagnostic(): Promise<DiagnosticForm> {
    await delay();
    this.requireStudent();
    return {
      intro: DIAGNOSTIC_INTRO,
      // Never send the answer key, concept, or stage to the student.
      items: diagnosticFor(this.requireStudent().id).map((q) => ({
        id: q.id,
        prompt: q.prompt,
        ...(q.figure ? { figure: q.figure } : {}),
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
      })),
    };
  }

  async submitDiagnostic(answers: DiagnosticAnswers) {
    await delay(400);
    const s = this.requireStudent();
    if (s.diagnostic) throw new ApiError('Diagnostic already submitted', 409);
    placeStudent(s, placeFromDiagnostic(answers, diagnosticFor(s.id)));
    this.persist();
    return lessonState(s);
  }

  async submitWork(levelId: string, response: string, signals?: WorkSignals): Promise<SubmitResult> {
    await delay();
    const s = this.requireStudent();
    if (s.currentLevelId !== levelId) throw new ApiError('That step is no longer current. Reload to continue.', 409);
    const level = levelById(levelId);
    const submissionId = newId();
    const record = (outcome: SubmissionOutcome) => {
      s.submissions[submissionId] = { readyAt: Date.now() + CHECKING_MS, outcome };
      this.persist();
      return { submissionId };
    };

    // 1. Filter input (fail-closed).
    const inFilter = filterText(response);
    this.audit(s.id, 'submission', 'input', submissionId, inFilter);
    if (!inFilter.ok) {
      s.validations.push({ at: nowIso(), levelCode: level.code, mode: 'withheld', results: [] });
      return record({ status: 'withheld', message: inFilter.message });
    }
    s.lastResponse[levelId] = response;
    const st = (s.levelStatus[levelId] ??= { attempts: 0, status: 'in-progress' });
    st.attempts += 1;

    // 2. Non-adaptive path: accept work, keep moving.
    if (s.mode === 'fallback') {
      s.validations.push({ at: nowIso(), levelCode: level.code, mode: 'fallback', results: [] });
      closeLevel(s, levelId, 'done');
      advance(s);
      return record({ status: 'done', nextAction: 'continue', coaching: 'Your work is saved. Here is your next step.', offerAssistant: false });
    }

    // 3. Validation (fault injection simulates Bedrock/validation failure; one retry).
    if (this.store.fault) {
      s.validations.push({ at: nowIso(), levelCode: level.code, mode: 'error', results: [] });
      s.flags.push(`Validation failed after retry on ${level.code}.`);
      s.mode = 'fallback';
      s.flags.push('Moved to non-adaptive path: validation failed after retry.');
      s.decisions.push({ at: nowIso(), levelCode: '-', levelTitle: 'Fallback', rule: 'Fallback: validation error after retry.', vector: { ...s.stages } });
      closeLevel(s, levelId, 'done');
      advance(s);
      return record({ status: 'done', nextAction: 'continue', coaching: 'Your work is saved. Here is your next step.', offerAssistant: false });
    }

    const ev = evaluate(level, s.stages, response);
    s.validations.push({ at: nowIso(), levelCode: level.code, mode: 'adaptive', results: ev.results, signals: signals ?? null });
    for (const r of ev.results) {
      if (r.passed) s.stages[r.conceptId] = r.targetStage;
      else s.transitionFails[`${r.conceptId}:${r.fromStage}`] = (s.transitionFails[`${r.conceptId}:${r.fromStage}`] ?? 0) + 1;
    }

    // 4. Filter output before it reaches the student (fail-closed).
    const outFilter = filterText(ev.coaching);
    this.audit(s.id, 'coaching', 'output', submissionId, outFilter);
    const coaching = outFilter.ok ? ev.coaching : 'Keep going. Take another look at the instructions for this step.';

    if (ev.allPassed || level.id === PROJECT_LEVEL_ID) {
      closeLevel(s, levelId, 'passed');
      advance(s);
      return record({ status: 'done', nextAction: 'continue', coaching, offerAssistant: false });
    }

    const stuck = ev.results.find((r) => !r.passed && (s.transitionFails[`${r.conceptId}:${r.fromStage}`] ?? 0) >= MAX_FAILS_PER_TRANSITION);
    if (stuck) {
      s.flags.push(`Repeated difficulty on ${conceptById(stuck.conceptId).name} (${stuck.fromStage}→${stuck.targetStage}).`);
      s.mode = 'fallback';
      s.decisions.push({ at: nowIso(), levelCode: '-', levelTitle: 'Fallback', rule: `Fallback: ${MAX_FAILS_PER_TRANSITION} attempts without meeting ${conceptById(stuck.conceptId).name} ${stuck.fromStage}→${stuck.targetStage}.`, vector: { ...s.stages } });
      closeLevel(s, levelId, 'exhausted');
      advance(s);
      return record({ status: 'done', nextAction: 'continue', coaching: "Your work is saved. Let's keep going with the next step.", offerAssistant: false });
    }

    if (st.attempts >= MAX_ATTEMPTS_PER_LEVEL) {
      closeLevel(s, levelId, 'exhausted');
      advance(s);
      return record({ status: 'done', nextAction: 'continue', coaching: `${coaching} Next, you'll practice the same idea in a different way.`, offerAssistant: false });
    }

    return record({ status: 'done', nextAction: 'revise', coaching, offerAssistant: true });
  }

  async getSubmission(submissionId: string): Promise<SubmissionOutcome> {
    await delay(150);
    const s = this.requireStudent();
    const sub = s.submissions[submissionId];
    if (!sub) throw new ApiError('Submission not found', 404);
    return Date.now() < sub.readyAt ? { status: 'checking' } : sub.outcome;
  }

  async chooseDepth(optionId: string) {
    await delay();
    const s = this.requireStudent();
    const r = route(s);
    if (r.kind !== 'choose-depth' || !r.options.some((o) => o.id === optionId)) {
      throw new ApiError('That choice is not available right now.', 409);
    }
    s.depthChoice = optionId;
    s.decisions.push({ at: nowIso(), levelCode: '-', levelTitle: 'Depth choice', rule: `Student chose: ${optionId === 'project' ? 'go to project' : `explore ${conceptById(optionId).name}`}.`, vector: { ...s.stages } });
    advance(s);
    this.persist();
    return lessonState(s);
  }

  async askAssistant(levelId: string, message: string): Promise<AssistantReply> {
    await delay(700);
    const s = this.requireStudent();
    const ref = newId();
    const inFilter = filterText(message);
    this.audit(s.id, 'assistant', 'input', ref, inFilter);
    if (!inFilter.ok) return { reply: inFilter.message, withheld: true };

    // Scripted stand-in for a Bedrock call scoped to the current level and stage.
    const level = levelById(levelId);
    const last = s.lastResponse[levelId] ?? '';
    const hints = applicableTransitions(level, s.stages)
      .flatMap((t) => t.checks)
      .filter((id, i, all) => all.indexOf(id) === i)
      .map((id) => CHECKS[id])
      .filter((c) => !c.test(last))
      .map((c) => c.hint);
    const reply = hints.length
      ? `Here's something to try for "${level.title}": ${hints[0]} What would you add to your answer?`
      : `You're close on "${level.title}". Reread the instructions and check that your answer covers each one.`;
    const outFilter = filterText(reply);
    this.audit(s.id, 'assistant', 'output', ref, outFilter);
    return outFilter.ok ? { reply, withheld: false } : { reply: 'Let me think about that differently. Try rereading the step instructions.', withheld: true };
  }

  // Teacher -----------------------------------------------------------------

  async getClassAttainment(): Promise<ClassAttainment> {
    await delay();
    this.requireTeacher();
    return {
      classId: CLASS_INFO.id,
      className: CLASS_INFO.name,
      bar: CLASS_INFO.bar,
      concepts: teacherConcepts(),
      students: Object.values(this.store.students).map(toAttainment),
    };
  }

  async getStudentTrace(studentId: string): Promise<StudentTrace> {
    await delay();
    this.requireTeacher();
    const s = this.store.students[studentId];
    if (!s) throw new ApiError('Student not found', 404);
    const { steps, gaps } = s.diagnostic ? buildRoadmap(s) : { steps: [], gaps: [] };
    const base = toAttainment(s);
    if (gaps.length) base.flags.push(`Roadmap gap: no authored route to the bar for ${gaps.map((g) => conceptById(g).name).join(', ')}.`);
    return {
      ...base,
      bar: CLASS_INFO.bar,
      concepts: teacherConcepts(),
      roadmap: steps,
      decisions: [...s.decisions].reverse(),
      validations: [...s.validations].reverse(),
      practice: Object.values(this.store.practice ?? {})
        .filter((p) => p.studentId === s.id)
        .reverse()
        .map(({ studentId: _sid, item: _item, ...r }) => r),
    };
  }

  async getInsights(): Promise<ClassInsights> {
    await delay();
    this.requireTeacher();
    const students = Object.values(this.store.students);
    const needsHelp: HelpNeeded[] = [];
    const groups = new Map<string, SkillGroup>();
    for (const s of students) {
      const latest = [...s.validations].reverse().find((v) => v.mode === 'adaptive');
      if (s.diagnostic && !s.complete) {
        const reasons: string[] = [];
        if (s.mode === 'fallback') reasons.push('Moved to the non-adaptive path');
        for (const [key, n] of Object.entries(s.transitionFails)) {
          const [c, from] = key.split(':');
          if (n >= 2) reasons.push(`${n} tries without meeting ${conceptById(c).name} ${from}→${Number(from) + 1}`);
        }
        const attempts = s.currentLevelId ? (s.levelStatus[s.currentLevelId]?.attempts ?? 0) : 0;
        if (attempts >= 2) reasons.push(`${attempts} attempts on the current step`);
        const sig = latest?.signals;
        if ((sig?.timeOnTaskSec ?? 0) >= 480) reasons.push(`${Math.round((sig?.timeOnTaskSec ?? 0) / 60)} min on their last step`);
        if ((sig?.edits ?? 0) >= 6) reasons.push(`${sig?.edits} rewrites before submitting`);
        if (reasons.length) {
          const lvl = s.currentLevelId ? levelById(s.currentLevelId) : null;
          needsHelp.push({ studentId: s.id, displayName: s.displayName, reasons, levelCode: lvl?.code ?? null, levelTitle: lvl?.title ?? null });
        }
      }
      if (!latest) continue;
      const level = LEVELS.find((l) => l.code === latest.levelCode);
      if (!level) continue;
      const text = s.lastResponse[level.id] ?? '';
      for (const r of latest.results.filter((x) => !x.passed)) {
        const t = level.transitions.find((x) => x.concept === r.conceptId && x.from === r.fromStage);
        for (const id of t?.checks ?? []) {
          if (CHECKS[id].test(text)) continue;
          const g = groups.get(id) ?? {
            checkId: id,
            skill: CHECKS[id].label,
            hint: CHECKS[id].hint,
            conceptId: r.conceptId,
            conceptName: conceptById(r.conceptId).name,
            students: [],
          };
          if (!g.students.some((x) => x.studentId === s.id)) g.students.push({ studentId: s.id, displayName: s.displayName });
          groups.set(id, g);
        }
      }
    }
    return {
      needsHelp: needsHelp.sort((a, b) => b.reasons.length - a.reasons.length),
      groups: [...groups.values()].sort((a, b) => b.students.length - a.students.length),
      concepts: CONCEPTS.map((c) => ({
        conceptId: c.id,
        name: c.name,
        byStage: [0, 1, 2, 3].map((st) => students.filter((s) => s.diagnostic && s.stages[c.id] === st).length),
      })),
      bar: CLASS_INFO.bar,
    };
  }

  async getMiniLesson(checkId: string): Promise<MiniLesson> {
    await delay(400);
    this.requireTeacher();
    const check = CHECKS[checkId];
    if (!check) throw new ApiError('Unknown skill', 404);
    const t = LEVELS.flatMap((l) => l.transitions).find((x) => x.checks.includes(checkId))!;
    const concept = conceptById(t.concept);
    return {
      title: `Mini-lesson: ${check.label}`,
      skill: check.label,
      concept: concept.name,
      goal: `Students show this in their own work: ${concept.descriptors[t.to]}`,
      warmup: 'Look at this request to an AI: "make a page for the bake sale". What would you add so the AI gets it right?',
      example: `Model it out loud on a fresh example, then point to where it shows: ${check.hint}`,
      tryIt: ['Each student revises their last answer using the hint above.', "Pairs swap and check each other's revision for it."],
      check: 'Ask each student to point to the exact words in their revision that show it.',
      source: 'authored',
      note: 'Mock mode: authored outline (the API writes it with Bedrock).',
    };
  }

  async getFilterAudit(): Promise<FilterAudit> {
    await delay();
    this.requireTeacher();
    const events = this.store.filterEvents ?? [];
    const has = (refId: string, context: FilterContext, direction: 'input' | 'output') =>
      events.some((e) => e.refId === refId && e.context === context && e.direction === direction);
    const students = Object.values(this.store.students);
    const subIds = students.flatMap((s) => Object.keys(s.submissions));
    // Submissions whose coaching went through validation (adaptive, not withheld/fallback/fault).
    const coachedIds = subIds.filter((id) => events.some((e) => e.refId === id && e.context === 'coaching'));
    const asked = events.filter((e) => e.context === 'assistant' && e.direction === 'input');
    const passed = asked.filter((e) => e.outcome === 'pass');
    const count = (direction: 'input' | 'output', outcome: string) =>
      events.filter((e) => e.direction === direction && e.outcome === outcome).length;
    const submissions = { required: subIds.length, checked: subIds.filter((id) => has(id, 'submission', 'input')).length };
    const coaching = { required: coachedIds.length, checked: coachedIds.length };
    const assistantReplies = { required: passed.length, checked: passed.filter((e) => has(e.refId, 'assistant', 'output')).length };
    const practiceAnswers = events.filter((e) => e.context === 'practice_answer');
    const practicePassed = practiceAnswers.filter((e) => e.outcome === 'pass');
    const practiceReplies = {
      required: practicePassed.length,
      checked: practicePassed.filter((e) => has(e.refId, 'practice', 'output')).length,
    };
    const bySource = new Map<string, FilterAudit['bySource'][number]>();
    for (const e of events) {
      const key = `${e.direction}|${e.outcome}|${e.source}`;
      const row = bySource.get(key) ?? { direction: e.direction, outcome: e.outcome, source: e.source, count: 0 };
      row.count += 1;
      bySource.set(key, row);
    }
    return {
      inputs: {
        required: submissions.required + asked.length + practiceAnswers.length,
        checked: submissions.checked + asked.length + practiceAnswers.length,
        blocked: count('input', 'blocked'),
        errors: count('input', 'error'),
      },
      outputs: {
        required: coaching.required + assistantReplies.required + practiceReplies.required,
        checked: coaching.checked + assistantReplies.checked + practiceReplies.checked,
        blocked: count('output', 'blocked'),
        errors: count('output', 'error'),
      },
      coverage: {
        submissions,
        coaching,
        assistantReplies,
        practice: {
          required: practiceAnswers.length + practiceReplies.required,
          checked: practiceAnswers.length + practiceReplies.checked,
        },
      },
      bySource: [...bySource.values()],
      recent: [...events]
        .reverse()
        .slice(0, 25)
        .map(({ refId: _refId, ...e }) => ({ ...e, displayName: this.store.students[e.studentId]?.displayName ?? e.studentId })),
    };
  }

  // Demo controls -------------------------------------------------------------

  async getFaultInjection() {
    return this.store.fault;
  }

  async previewPrompt(_levelId: string, prompt: string) {
    await delay(500);
    const esc = prompt.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    return {
      withheld: false as const,
      html: `<body style="font-family:sans-serif;padding:24px"><h1>Preview (offline)</h1><blockquote>${esc}</blockquote></body>`,
    };
  }

  async chooseTopic(): Promise<LessonState> {
    // The offline mock has one unit and no topics.
    return lessonState(this.requireStudent());
  }

  async getUnits() {
    return { current: 'mock', units: [{ id: 'mock', name: CLASS_INFO.name, summary: 'Offline demo unit' }] };
  }

  async setUnit() {
    // No-op: units live in the API.
  }

  async getRoutingMode() {
    // The mock has no model, so routing is always rule-based.
    return { mode: 'rules' as const, available: false };
  }

  async setRoutingMode() {
    // No-op: AI-advised routing needs the API with Bedrock.
  }

  async setFaultInjection(on: boolean) {
    this.store.fault = on;
    this.persist();
  }

  // Formative practice ------------------------------------------------------
  // The mock has no model, so it serves approved drafts first, then the authored bank
  // (the API generates live, gates it, and falls back the same way).

  async createPractice(levelId: string): Promise<PracticeItem> {
    await delay(500);
    const s = this.requireStudent();
    if (s.currentLevelId !== levelId) throw new ApiError('That step is not current.', 409);
    const level = levelById(levelId);
    const t = applicableTransitions(level, s.stages)[0] ?? lowestBelow(s.stages);
    if (!t) throw new ApiError('No practice available for this step.', 404);
    const approved = (this.store.content ?? []).filter(
      (c) => c.status === 'approved' && c.conceptId === t.concept && c.fromStage === t.from,
    );
    const fromBank = approved.length ? pick(approved) : null;
    const authored =
      pick(PRACTICE_BANK.filter((b) => b.concept === t.concept && b.from === t.from)) ??
      PRACTICE_BANK.find((b) => b.concept === t.concept)!;
    const src: Pick<BankItem, 'title' | 'scenario' | 'task' | 'tip'> = fromBank ?? authored;
    const item: PracticeItem = {
      id: newId(),
      title: src.title,
      scenario: src.scenario,
      task: src.task,
      tip: src.tip,
      aiGenerated: false,
    };
    (this.store.practice ??= {})[item.id] = {
      id: item.id,
      at: nowIso(),
      levelCode: level.code,
      conceptId: t.concept,
      fromStage: t.from,
      targetStage: t.to,
      title: item.title,
      origin: fromBank ? 'bank' : 'authored',
      fallbackReason: 'mock mode: no live generation',
      quality: null,
      attempts: 0,
      studentId: s.id,
      item,
    };
    this.persist();
    return item;
  }

  async answerPractice(practiceId: string, response: string): Promise<PracticeFeedback> {
    await delay(500);
    const s = this.requireStudent();
    const p = this.store.practice?.[practiceId];
    if (!p || p.studentId !== s.id) throw new ApiError('Practice not found', 404);
    if (!response.trim()) throw new ApiError('Response is empty', 422);
    const attemptId = newId();
    const input = filterText(response);
    this.audit(s.id, 'practice_answer', 'input', attemptId, input);
    p.attempts += 1;
    if (!input.ok) {
      this.persist();
      return { feedback: input.message, withheld: true };
    }
    const checks =
      LEVELS.flatMap((l) => l.transitions).find((t) => t.concept === p.conceptId && t.to === p.targetStage)?.checks ?? [];
    const missing = checks.map((id) => CHECKS[id]).filter((c) => !c.test(response));
    const feedback = missing.length
      ? `Good start. Next, try this: ${missing[0].hint}`
      : 'Nice work. You covered what this practice was about. Ready to go back to your task?';
    this.audit(s.id, 'practice', 'output', attemptId, filterText(feedback));
    this.persist();
    return { feedback, withheld: false };
  }

  // Authoring ----------------------------------------------------------------

  async getAuthoring(): Promise<AuthoringState> {
    await delay();
    this.requireTeacher();
    const content = this.store.content ?? [];
    const practice = Object.values(this.store.practice ?? {});
    return {
      items: [...content].reverse(),
      bank: REQUIRED_CONCEPTS.flatMap((cid) =>
        ([0, 1, 2] as const).map((from) => ({
          conceptId: cid,
          fromStage: from,
          targetStage: (from + 1) as Stage,
          authored: PRACTICE_BANK.filter((b) => b.concept === cid && b.from === from).length,
          approved: content.filter((c) => c.status === 'approved' && c.conceptId === cid && c.fromStage === from).length,
        })),
      ),
      practice: {
        generated: practice.filter((p) => p.origin === 'generated').length,
        fromApprovedBank: practice.filter((p) => p.origin === 'bank').length,
        fromAuthored: practice.filter((p) => p.origin === 'authored').length,
        fellBack: practice.filter((p) => p.origin !== 'generated').length,
      },
    };
  }

  /** Mock drafting: templated items grounded in source sentences (the API uses Bedrock). */
  async draftContent(req: DraftRequest): Promise<DraftResult> {
    await delay(900);
    const teacher = this.requireTeacher();
    const text = req.sourceText.trim();
    if (text.length < 40) throw new ApiError('Paste at least a few sentences of source material', 422);
    let redactions = 0;
    const redact = () => {
      redactions += 1;
      return '[redacted]';
    };
    const redacted = text
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, redact)
      .replace(/(\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, redact);
    const sentences = redacted.split(/(?<=[.!?])\s+/).filter((x) => x.split(/\s+/).length >= 5);
    const concept = conceptById(req.concept);
    const to = (req.fromStage + 1) as Stage;
    const settings = ['the school library page', 'a food drive sign-up page', 'the band concert schedule'];
    const items = Array.from({ length: Math.min(Math.max(req.count, 1), 3) }, (_, i): ContentItem => {
      const quote = (sentences[i % Math.max(sentences.length, 1)] ?? redacted).split(/\s+/).slice(0, 25).join(' ');
      const draft = {
        title: `${concept.name}: ${settings[i]}`,
        scenario: `A student group is building ${settings[i]} with help from an AI.`,
        task: `Using the idea from your notes, show this for ${settings[i]}: ${concept.descriptors[to].toLowerCase()}`,
        tip: 'Start with one concrete example from the page before you write.',
      };
      return {
        id: newId(),
        conceptId: req.concept,
        fromStage: req.fromStage,
        targetStage: to,
        ...draft,
        status: 'pending',
        version: 1,
        sourceTitle: req.sourceTitle || null,
        sourceQuote: quote,
        quoteVerified: true,
        quality: mockQuality(draft),
        filter: { ok: true, source: 'local', redactions },
        reviewerNote: null,
        createdBy: teacher.id,
        reviewedBy: null,
        at: nowIso(),
      };
    });
    (this.store.content ??= []).push(...items);
    this.persist();
    return { items, redactions };
  }

  async reviewContent(
    id: string,
    decision: 'approve' | 'reject',
    edits?: ContentEdits,
    note?: string,
  ): Promise<ContentItem> {
    await delay();
    const teacher = this.requireTeacher();
    const item = (this.store.content ?? []).find((c) => c.id === id);
    if (!item) throw new ApiError('Item not found', 404);
    if (decision === 'approve') {
      const fields = ['title', 'scenario', 'task', 'tip'] as const;
      const next = { ...item };
      for (const f of fields) if (edits?.[f]?.trim()) next[f] = edits[f]!.trim();
      if (fields.some((f) => next[f] !== item[f])) {
        const q = mockQuality(next);
        if (q.prechecks.length) throw new ApiError(`Edit not allowed: ${q.prechecks.join('; ')}`, 422);
        Object.assign(item, next, { version: item.version + 1, quality: q });
      }
      item.status = 'approved';
    } else {
      item.status = 'rejected';
    }
    item.reviewerNote = note?.trim() || null;
    item.reviewedBy = teacher.id;
    this.persist();
    return item;
  }

  async resetDemo() {
    const sessionUserId = this.store.sessionUserId;
    this.store = { ...seed(), sessionUserId, content: this.store.content };
    this.persist();
  }
}

const pick = <T>(xs: T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)];

const EVALUATIVE = /\b(stages?|scores?|scored|grades?|graded|points?|rank(ed|ing)?|percent(ile)?|level \d|pass(ed)?|fail(ed)?)\b/i;

/** Mock of the API's quality pre-checks (the API adds the LLM judge). */
function mockQuality(item: { title: string; scenario: string; task: string; tip: string }): QualityResult {
  const text = [item.title, item.scenario, item.task, item.tip].join(' ');
  const prechecks: string[] = [];
  const m = text.match(EVALUATIVE);
  if (m) prechecks.push(`mentions evaluation ("${m[0]}")`);
  if (item.task.split(/\s+/).filter(Boolean).length < 8) prechecks.push('task is too short');
  return {
    passed: prechecks.length === 0,
    scores: {},
    notes: prechecks.length ? `Failed pre-checks: ${prechecks.join('; ')}` : 'Pre-checks only (mock mode has no model judge).',
    prechecks,
    judge: 'skipped',
  };
}

/** Lowest concept still below Exceeding (practice target when the level has no open transition). */
function lowestBelow(stages: StageVector) {
  const cid = [...REQUIRED_CONCEPTS].sort((a, b) => stages[a] - stages[b])[0];
  const from = stages[cid];
  return from < 3 ? { concept: cid, from, to: (from + 1) as Stage, checks: [] as string[] } : undefined;
}
