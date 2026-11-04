/**
 * Reference implementation of the adaptive engine rules, used by the mock API.
 *
 * In the target architecture this logic lives in the Rails app tier (design §3A).
 * It is kept as pure functions here so the Rails port can be checked against it.
 *  - Diagnostic placement (design §6.1, FR1)
 *  - Deterministic routing (design §8, FR5, NFR4)
 *  - Coverage-guaranteed roadmap (FR2, M2)
 *  - Validation via deterministic probes (design §7 step 2). The Bedrock rubric
 *    eval (step 3) is NOT simulated; the mock scores with probes only.
 *  - Content filtering stand-in for Bedrock Guardrails (FR11, NFR1)
 */
import type {
  ConceptId,
  DepthOption,
  RoadmapStep,
  Stage,
  StageVector,
  ValidationConceptResult,
} from '../types';
import {
  CHECKS,
  CLASS_INFO,
  CONCEPTS,
  FALLBACK_SEQUENCE,
  LEVELS,
  PROJECT_LEVEL_ID,
  REQUIRED_CONCEPTS,
  conceptById,
  levelById,
  type Level,
  type Transition,
} from './curriculum';
import { DIAGNOSTIC_BANK, type DiagnosticQuestion } from './diagnosticBank';

export const BAR = CLASS_INFO.bar;
/** Attempts on one level before routing to an alternate level for the same transition. */
export const MAX_ATTEMPTS_PER_LEVEL = 2;
/** Failed attempts on one concept transition before fallback + teacher flag (design §14). */
export const MAX_FAILS_PER_TRANSITION = 4;

export type LevelStatus = 'in-progress' | 'passed' | 'exhausted' | 'done';

export type RouteResult =
  | { kind: 'level'; levelId: string; rule: string }
  | { kind: 'choose-depth'; options: DepthOption[] }
  | { kind: 'complete' }
  | { kind: 'fallback'; reason: string };

export interface EngineState {
  mode: 'adaptive' | 'fallback';
  stages: StageVector;
  levelStatus: Record<string, { attempts: number; status: LevelStatus }>;
  depthChoice: string | null;
}

export const zeroVector = (): StageVector =>
  Object.fromEntries(REQUIRED_CONCEPTS.map((c) => [c, 0 as Stage]));

/** One question per required concept per stage 1-3, stable per student (mirrors Curriculum#diagnostic_for). */
export function diagnosticFor(studentId: string): DiagnosticQuestion[] {
  const hash = (text: string) => [...text].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);
  return REQUIRED_CONCEPTS.flatMap((cid) =>
    ([1, 2, 3] as const).flatMap((stage) => {
      const pool = DIAGNOSTIC_BANK.filter((q) => q.concept === cid && q.stage === stage);
      return pool.length ? [pool[hash(`${studentId}:${cid}:${stage}`) % pool.length]] : [];
    }),
  );
}

/** FR1 ladder placement: climb stages while answers are correct; the first miss stops the climb. */
export function placeFromDiagnostic(answers: Record<string, string>, questions: DiagnosticQuestion[]): StageVector {
  const placed = zeroVector();
  for (const cid of REQUIRED_CONCEPTS) {
    for (const q of questions.filter((x) => x.concept === cid).sort((a, b) => a.stage - b.stage)) {
      if (answers[q.id] !== q.answer) break;
      placed[cid] = q.stage;
    }
  }
  return placed;
}

export const belowBar = (stages: StageVector): ConceptId[] =>
  REQUIRED_CONCEPTS.filter((c) => (stages[c] ?? 0) < BAR);

export function applicableTransitions(level: Level, stages: StageVector): Transition[] {
  return level.transitions.filter(
    (t) => REQUIRED_CONCEPTS.includes(t.concept) && (stages[t.concept] ?? 0) === t.from,
  );
}

const isClosed = (s: EngineState, levelId: string) => {
  const st = s.levelStatus[levelId]?.status;
  return st === 'passed' || st === 'exhausted' || st === 'done';
};

const fmtVector = (v: StageVector) =>
  REQUIRED_CONCEPTS.map((c) => `${conceptById(c).name} ${v[c] ?? 0}`).join(', ');

/** Deterministic routing over the stage vector (design §8). */
export function route(s: EngineState): RouteResult {
  if (s.mode === 'fallback') {
    const next = FALLBACK_SEQUENCE.find((id) => !isClosed(s, id));
    return next
      ? {
          kind: 'level',
          levelId: next,
          rule: `Non-adaptive path: next authored level in the fixed sequence (${levelById(next).code}).`,
        }
      : { kind: 'complete' };
  }

  const below = belowBar(s.stages);
  if (below.length > 0) {
    const scored = LEVELS.filter((l) => l.kind === 'task' && !isClosed(s, l.id))
      .map((l, index) => {
        const serves = applicableTransitions(l, s.stages).filter(
          (t) => below.includes(t.concept) && t.to <= BAR,
        );
        return {
          level: l,
          index,
          serves,
          minStage: Math.min(...serves.map((t) => s.stages[t.concept] ?? 0)),
          minOrder: Math.min(...serves.map((t) => conceptById(t.concept).order)),
        };
      })
      .filter((c) => c.serves.length > 0)
      .sort(
        (a, b) =>
          b.serves.length - a.serves.length ||
          a.minStage - b.minStage ||
          a.minOrder - b.minOrder ||
          a.index - b.index,
      );

    if (scored.length === 0) {
      return {
        kind: 'fallback',
        reason: `No authored level left for ${below.map((c) => conceptById(c).name).join(', ')}.`,
      };
    }
    const pick = scored[0];
    const servesNames = pick.serves.map((t) => `${conceptById(t.concept).name} ${t.from}→${t.to}`);
    return {
      kind: 'level',
      levelId: pick.level.id,
      rule:
        `Below bar: ${below.map((c) => conceptById(c).name).join(', ')}. ` +
        `Picked ${pick.level.code}: advances ${pick.serves.length} below-bar concept(s) (${servesNames.join('; ')}), ` +
        `the most of ${scored.length} candidate level(s). Tie-break: lowest current stage, then concept order. ` +
        `Vector: ${fmtVector(s.stages)}.`,
    };
  }

  // Every required concept is at the bar. Offer optional Stage 3 depth, then the project.
  if (s.depthChoice === null) return { kind: 'choose-depth', options: depthOptions(s) };
  if (s.depthChoice !== 'project') {
    const depthLevel = LEVELS.find(
      (l) =>
        !isClosed(s, l.id) &&
        l.transitions.some((t) => t.concept === s.depthChoice && t.from === 2 && t.to === 3),
    );
    if (depthLevel && (s.stages[s.depthChoice] ?? 0) === 2) {
      return {
        kind: 'level',
        levelId: depthLevel.id,
        rule: `All required concepts at bar. Student chose optional depth on ${conceptById(s.depthChoice).name}: ${depthLevel.code}.`,
      };
    }
  }
  if (!isClosed(s, PROJECT_LEVEL_ID)) {
    return {
      kind: 'level',
      levelId: PROJECT_LEVEL_ID,
      rule: 'All required concepts at bar. Routing to the project culmination.',
    };
  }
  return { kind: 'complete' };
}

export function depthOptions(s: EngineState): DepthOption[] {
  const options: DepthOption[] = CONCEPTS.filter(
    (c) =>
      (s.stages[c.id] ?? 0) === 2 &&
      LEVELS.some(
        (l) => !isClosed(s, l.id) && l.transitions.some((t) => t.concept === c.id && t.from === 2),
      ),
  ).map((c) => {
    const lvl = LEVELS.find((l) => l.transitions.some((t) => t.concept === c.id && t.from === 2))!;
    return { id: c.id, label: lvl.title, description: lvl.intro };
  });
  options.push({
    id: 'project',
    label: levelById(PROJECT_LEVEL_ID).title,
    description: 'Jump straight into building your own page.',
  });
  return options;
}

/**
 * Coverage-guaranteed roadmap (FR2): simulate routing forward, assuming each
 * routed level is passed, until every required concept reaches the bar.
 */
export function buildRoadmap(s: EngineState): { steps: RoadmapStep[]; gaps: ConceptId[] } {
  const sim: EngineState = structuredClone(s);
  const steps: RoadmapStep[] = [];
  for (let guard = 0; guard < LEVELS.length + 2; guard++) {
    const r = route(sim);
    if (r.kind !== 'level') break;
    const level = levelById(r.levelId);
    const advances = applicableTransitions(level, sim.stages).filter(
      (t) => sim.mode === 'fallback' || (sim.stages[t.concept] ?? 0) < BAR || sim.depthChoice === t.concept,
    );
    steps.push({ levelCode: level.code, title: level.title, targets: advances.map((t) => t.concept) });
    if (sim.mode === 'adaptive') for (const t of advances) sim.stages[t.concept] = t.to;
    sim.levelStatus[level.id] = { attempts: 1, status: 'passed' };
    if (level.id === PROJECT_LEVEL_ID) break;
    if (sim.mode === 'adaptive' && belowBar(sim.stages).length === 0 && sim.depthChoice === null) {
      sim.depthChoice = 'project';
    }
  }
  const gaps = sim.mode === 'adaptive' ? belowBar(sim.stages) : [];
  return { steps, gaps };
}

export interface Evaluation {
  results: ValidationConceptResult[];
  allPassed: boolean;
  coaching: string;
}

/** Probe-based validation (design §7). Probes cap the stage: any failed probe blocks the transition. */
export function evaluate(level: Level, stages: StageVector, text: string): Evaluation {
  const results: ValidationConceptResult[] = applicableTransitions(level, stages).map((t) => {
    const outcomes = t.checks.map((id) => ({ check: CHECKS[id], ok: CHECKS[id].test(text) }));
    const passed = outcomes.every((o) => o.ok);
    return {
      conceptId: t.concept,
      fromStage: t.from,
      targetStage: t.to,
      observedStage: passed ? t.to : t.from,
      passed,
      evidence: outcomes.map((o) => `${o.ok ? 'Met' : 'Not yet'}: ${o.check.label}`),
    };
  });

  const failedHints = applicableTransitions(level, stages)
    .flatMap((t) => t.checks)
    .filter((id, i, all) => all.indexOf(id) === i)
    .map((id) => CHECKS[id])
    .filter((c) => !c.test(text))
    .map((c) => c.hint);

  const allPassed = results.every((r) => r.passed);
  const coaching = allPassed
    ? level.kind === 'project'
      ? 'Your project log is saved. Keep iterating on your page as long as you like.'
      : 'Nice work. You covered what this step was about. On to the next one.'
    : `You're on your way. ${failedHints.slice(0, 2).join(' ')}`;
  return { results, allPassed, coaching };
}

// ---------------------------------------------------------------------------
// Content filtering stand-in (fail-closed). Production uses Bedrock Guardrails.
// ---------------------------------------------------------------------------

const PII_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /[\w.+-]+@[\w-]+\.[\w.]+/, reason: 'an email address' },
  { re: /(\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/, reason: 'a phone number' },
];
const UNSAFE_PATTERN = /\b(kill (yourself|myself)|suicide|self[- ]harm|porn|nazi)\b/i;

export type FilterResult = { ok: true } | { ok: false; message: string };

export function filterText(text: string): FilterResult {
  try {
    for (const { re, reason } of PII_PATTERNS) {
      if (re.test(text)) {
        return {
          ok: false,
          message: `It looks like your message includes ${reason}. Please remove personal information and try again.`,
        };
      }
    }
    if (UNSAFE_PATTERN.test(text)) {
      return {
        ok: false,
        message:
          "We can't use that message here. If something is worrying you, please talk to your teacher or another adult you trust.",
      };
    }
    return { ok: true };
  } catch {
    // Fail closed: if filtering itself fails, withhold.
    return { ok: false, message: "We couldn't check that message just now. Please try again." };
  }
}
