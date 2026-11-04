import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Chip, CircularProgress, Container, Link, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import {
  api,
  type ClassAttainment,
  type ConceptId,
  type FilterAudit,
  type Stage,
  type StudentTrace,
  type TeacherConcept,
} from '../../api';
import { brand } from '../../theme';
import { STAGE_NAMES } from './StageCell';
import { HeaderStat, TeacherHeader } from './TeacherHeader';

/**
 * Launch-gate evidence (BRD §7.2): M1-M4, M6 and M7 computed live from the
 * same teacher endpoints the dashboard uses. M5 (validator vs human raters) is
 * an offline benchmark, so it is linked rather than computed here.
 */

const chrono = <T extends { at: string }>(xs: T[]) => [...xs].sort((a, b) => a.at.localeCompare(b.at));
const routed = (t: StudentTrace) => chrono(t.decisions).filter((d) => d.levelCode !== '-');
const sameStages = (a: Record<string, Stage> | null, b: Record<string, Stage> | null) =>
  !!a && !!b && Object.keys(a).every((k) => a[k] === b[k]);

interface Advance {
  conceptId: ConceptId;
  steps: { at: string; levelCode: string; from: Stage; to: Stage }[];
}

/** Stage transitions per concept, from passed adaptive validations (oldest first). */
function advances(t: StudentTrace): Advance[] {
  const by = new Map<ConceptId, Advance>();
  for (const v of chrono(t.validations)) {
    if (v.mode !== 'adaptive') continue;
    for (const r of v.results) {
      if (!r.passed || r.targetStage <= r.fromStage) continue;
      const a = by.get(r.conceptId) ?? { conceptId: r.conceptId, steps: [] };
      a.steps.push({ at: v.at, levelCode: v.levelCode, from: r.fromStage, to: r.targetStage });
      by.set(r.conceptId, a);
    }
  }
  return [...by.values()].sort((a, b) => b.steps.length - a.steps.length);
}

/** Concepts still below the bar that the remaining roadmap does not target (M2 coverage gap). */
function uncovered(t: StudentTrace): ConceptId[] {
  const targeted = new Set(t.roadmap.flatMap((s) => s.targets));
  return t.concepts.filter((c) => t.stages[c.id] < t.bar && !targeted.has(c.id)).map((c) => c.id);
}

const hadFallback = (t: StudentTrace) =>
  t.status === 'fallback' || t.decisions.some((d) => d.levelTitle === 'Fallback');
/** A session is broken if validation errored and the engine did not move the student to the fallback path. */
const broken = (t: StudentTrace) => t.validations.some((v) => v.mode === 'error') && !hadFallback(t);

export function EvidencePage() {
  const navigate = useNavigate();
  const [cls, setCls] = useState<ClassAttainment | null>(null);
  const [traces, setTraces] = useState<StudentTrace[] | null>(null);
  const [audit, setAudit] = useState<FilterAudit | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setTraces(null);
    (async () => {
      const c = await api.getClassAttainment();
      setCls(c);
      const started = c.students.filter((s) => s.diagnostic);
      const [ts, fa] = await Promise.all([
        Promise.all(started.map((s) => api.getStudentTrace(s.studentId))),
        api.getFilterAudit().catch(() => null),
      ]);
      setTraces(ts);
      setAudit(fa);
    })().catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  if (error) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">Could not load evidence: {error}</Alert>
      </Container>
    );
  }
  if (!cls || !traces) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', flex: 1 }}>
        <CircularProgress aria-label="Loading evidence" />
      </Box>
    );
  }

  const concepts = cls.concepts;
  const cname = (id: string) => concepts.find((c) => c.id === id)?.name ?? id;

  // M1: every started student has an entry stage for every concept.
  const m1Placed = traces.filter((t) => t.diagnostic && concepts.every((c) => t.diagnostic![c.id] !== undefined));
  const m1 = traces.length > 0 && m1Placed.length === traces.length;

  // M2: every concept still below the bar is on the remaining roadmap.
  const m2Gaps = traces.map((t) => ({ t, gaps: uncovered(t) })).filter((x) => x.gaps.length > 0);
  const m2 = traces.length > 0 && m2Gaps.length === 0;

  // M3: one student, one concept, >= 2 stage transitions, >= 3 routed levels.
  const m3Candidates = traces
    .map((t) => ({ t, adv: advances(t)[0], levels: routed(t).length }))
    .filter((x) => x.adv)
    .sort((a, b) => b.adv.steps.length - a.adv.steps.length || b.levels - a.levels);
  const m3Best = m3Candidates[0];
  const m3 = !!m3Best && m3Best.adv.steps.length >= 2 && m3Best.levels >= 3;

  // M4: two students with different placements get different routes. Prefer Ava vs Ben.
  const pairs: [StudentTrace, StudentTrace][] = [];
  for (let i = 0; i < traces.length; i++)
    for (let j = i + 1; j < traces.length; j++) {
      const [a, b] = [traces[i], traces[j]];
      const ra = routed(a)
        .map((d) => d.levelCode)
        .join('>');
      const rb = routed(b)
        .map((d) => d.levelCode)
        .join('>');
      if (!sameStages(a.diagnostic, b.diagnostic) && ra !== rb) pairs.push([a, b]);
    }
  const prefer = (p: [StudentTrace, StudentTrace]) =>
    +[p[0].studentId, p[1].studentId].includes('s-hithesh') + +[p[0].studentId, p[1].studentId].includes('s-tanushree');
  const m4Pair = pairs.sort((p, q) => prefer(q) - prefer(p))[0];
  const m4 = !!m4Pair;

  // M6: induced failure -> fallback, and no broken sessions.
  const m6Fallback = traces.filter(hadFallback);
  const m6Broken = traces.filter(broken);
  const m6 = m6Fallback.length > 0 && m6Broken.length === 0;

  // M7: from the filter audit log.
  const m7Gaps = audit
    ? [
        audit.coverage.submissions,
        audit.coverage.coaching,
        audit.coverage.assistantReplies,
        audit.coverage.practice,
      ].reduce((n, c) => n + c.required - c.checked, 0)
    : null;
  const m7Total = audit ? audit.inputs.required + audit.outputs.required : 0;
  const m7 = audit !== null && m7Gaps === 0 && m7Total > 0;

  const met = [m1, m2, m3, m4, m6, m7].filter(Boolean).length;

  // AI-advised routing: the advisor only ever picks among rule-approved candidates.
  const advised = traces.flatMap((t) => t.decisions.filter((d) => d.advisor).map((d) => ({ t, d, a: d.advisor! })));
  const accepted = advised.filter((x) => x.a.accepted);
  const differed = accepted.filter((x) => !x.a.agreed);
  const kept = advised.filter((x) => !x.a.accepted);
  const outside = accepted.filter((x) => !x.a.candidates.includes(x.a.proposed ?? x.d.levelCode));

  return (
    <Box sx={{ flex: 1 }}>
      <TeacherHeader
        eyebrow="Launch gates · BRD §7.2"
        title="MVP evidence"
        subtitle="Each metric is computed live from the class data. Play a student, then refresh to watch it update."
        right={
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <HeaderStat label="metrics shown live" value={`${met}/6`} />
            <HeaderStat label="students started" value={`${traces.length}/${cls.students.length}`} />
          </Box>
        }
      />

      <Container maxWidth="lg" sx={{ py: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/teacher')} sx={{ color: brand.charcoal }}>
            Class
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button startIcon={<RefreshIcon />} onClick={load} sx={{ color: brand.charcoal }}>
            Refresh
          </Button>
        </Box>

        <Gate
          id="AI"
          title="AI-advised routing, guardrailed by the rules"
          ok={advised.length > 0 ? outside.length === 0 : false}
          claim="The rules list every level that keeps a student on track to the bar; the AI picks one from the student's evidence and explains why. Picks outside that list are refused."
          todo="Turn on AI-advised routing in the Demo menu (on by default), then submit as a student."
        >
          <Typography variant="body2" sx={{ mb: 1 }}>
            {advised.length} routing decision(s) advised: {accepted.length - differed.length} same as the rules,{' '}
            {differed.length} chose differently, {kept.length} kept the rules choice (advisor off-list or unavailable).{' '}
            <b>Picks outside the rule-approved set: {outside.length}</b>
          </Typography>
          {differed.slice(0, 3).map(({ t, d, a }) => (
            <Typography key={`${t.studentId}-${d.at}`} variant="body2" color="text.secondary">
              {t.displayName}: {d.levelCode} instead of {a.ruleChoice} (from {a.candidates.join(', ')}). {a.reason}
            </Typography>
          ))}
        </Gate>

        <Gate
          id="M1"
          title="Diagnostic placement"
          ok={m1}
          claim="The diagnostic sets an entry stage on every concept for every student who took it."
        >
          <Typography variant="body2" sx={{ mb: 1 }}>
            {m1Placed.length}/{traces.length} students placed on all {concepts.length} concepts.
          </Typography>
          <PlacementTable
            concepts={concepts}
            rows={traces.slice(0, 7).map((t) => ({ name: t.displayName, stages: t.diagnostic }))}
          />
        </Gate>

        <Gate
          id="M2"
          title="Roadmap covers every required concept"
          ok={m2}
          claim="Every concept a student is still below Meeting on is on their remaining roadmap. Nothing can be skipped."
        >
          {m2Gaps.length === 0 ? (
            <Typography variant="body2">
              0 gaps across {traces.length} students. Example ({traces[0]?.displayName}):{' '}
              {traces[0] && traces[0].roadmap.length > 0
                ? traces[0].roadmap.map((s) => `${s.levelCode} (${s.targets.map(cname).join(', ')})`).join(' → ')
                : 'already at the bar on every concept'}
            </Typography>
          ) : (
            m2Gaps.map(({ t, gaps }) => (
              <Typography key={t.studentId} variant="body2">
                {t.displayName}: no route for {gaps.map(cname).join(', ')}
              </Typography>
            ))
          )}
        </Gate>

        <Gate
          id="M3"
          title="Adaptive advancement"
          ok={m3}
          claim="A student advances one concept across 2 or more stage transitions via 3 or more routed levels, each route chosen from the mastery signal."
          todo="Sign in as a student and pass a few steps; the same concept needs two stage jumps."
        >
          {m3Best ? (
            <>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <b>{m3Best.t.displayName}</b>: {cname(m3Best.adv.conceptId)} advanced{' '}
                {m3Best.adv.steps
                  .map((s) => `${STAGE_NAMES[s.from]} → ${STAGE_NAMES[s.to]} (${s.levelCode})`)
                  .join(', then ')}
                . {m3Best.levels} routed levels.{' '}
                <Link component={RouterLink} to={`/teacher/students/${m3Best.t.studentId}`}>
                  Full trace
                </Link>
              </Typography>
              <RouteList trace={m3Best.t} />
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No passed steps yet.
            </Typography>
          )}
        </Gate>

        <Gate
          id="M4"
          title="Differentiated paths"
          ok={m4}
          claim="Two students with different placements get different routes to the same bar."
          todo="Two students need to start with different diagnostic answers."
        >
          {m4Pair && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              {m4Pair.map((t) => (
                <Box key={t.studentId} sx={{ border: `1px solid ${brand.borderLight}`, borderRadius: 1.5, p: 1.5 }}>
                  <Typography sx={{ fontWeight: 700, mb: 1 }}>{t.displayName}</Typography>
                  <PlacementTable concepts={concepts} rows={[{ name: 'Placed', stages: t.diagnostic }]} />
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    <b>Route:</b>{' '}
                    {[...routed(t).map((d) => d.levelCode), ...t.roadmap.map((s) => `${s.levelCode}*`)].join(' → ') ||
                      '—'}
                  </Typography>
                </Box>
              ))}
              <Typography variant="caption" color="text.secondary" sx={{ gridColumn: '1 / -1' }}>
                * still ahead on the roadmap. Both routes lead to Meeting on every concept.
              </Typography>
            </Box>
          )}
        </Gate>

        <Gate
          id="M5"
          title="Validation agrees with human raters"
          ok={null}
          claim="The mastery signal matches human ratings on a benchmark set (≥80% exact or ≥90% within one stage)."
        >
          <Typography variant="body2">
            Measured offline: <code>scripts/run-benchmark.sh</code> scores <code>api/benchmark/submissions.yml</code>{' '}
            (80 items) and prints exact and ±1 agreement. The set is synthetic until Teaching &amp; Learning re-rates
            it.
          </Typography>
        </Gate>

        <Gate
          id="M6"
          title="Safe fallback"
          ok={m6}
          claim="When validation fails, the student drops to a working non-adaptive path. Zero broken sessions."
          todo="Turn on fault injection in the Demo menu, then submit as a student."
        >
          <Typography variant="body2">
            {m6Fallback.length} student(s) moved to the non-adaptive path:{' '}
            {m6Fallback
              .map(
                (t) =>
                  `${t.displayName} (${t.stepsCompleted} steps done, ${t.status === 'complete' ? 'finished' : 'still working'})`,
              )
              .join('; ') || 'none yet'}
            .
            <br />
            <b>Broken sessions: {m6Broken.length}</b>
            {m6Broken.length > 0 && ` (${m6Broken.map((t) => t.displayName).join(', ')})`}
          </Typography>
        </Gate>

        <Gate
          id="M7"
          title="Safety coverage"
          ok={m7}
          claim="Content filtering runs on 100% of student inputs and model outputs before delivery."
          todo="Submit work or ask the assistant as a student to create filter records."
        >
          {audit ? (
            <Typography variant="body2">
              Inputs checked {audit.inputs.checked}/{audit.inputs.required}, outputs checked {audit.outputs.checked}/
              {audit.outputs.required}, {m7Gaps} unchecked. {audit.inputs.blocked + audit.outputs.blocked} blocked.{' '}
              <Link component={RouterLink} to="/teacher/safety">
                Safety log
              </Link>
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Safety log unavailable.
            </Typography>
          )}
        </Gate>
      </Container>
    </Box>
  );
}

function Gate({
  id,
  title,
  claim,
  ok,
  todo,
  children,
}: {
  id: string;
  title: string;
  claim: string;
  ok: boolean | null;
  todo?: string;
  children: ReactNode;
}) {
  return (
    <Box
      component="section"
      sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 2, p: 2.5 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 0.5 }}>
        <Chip label={id} size="small" sx={{ fontWeight: 800, bgcolor: brand.purple, color: '#fff' }} />
        <Typography variant="h2" sx={{ fontSize: '1.15rem', flex: 1, minWidth: 200 }}>
          {title}
        </Typography>
        {ok === null ? (
          <Chip size="small" label="Offline benchmark" variant="outlined" />
        ) : ok ? (
          <Chip size="small" color="success" icon={<CheckCircleIcon />} label="Shown" />
        ) : (
          <Chip size="small" color="warning" variant="outlined" icon={<HourglassEmptyIcon />} label="Not shown yet" />
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {claim}
      </Typography>
      {children}
      {ok === false && todo && (
        <Typography variant="body2" sx={{ mt: 1, color: '#8a5a00' }}>
          To show it: {todo}
        </Typography>
      )}
    </Box>
  );
}

function PlacementTable({
  concepts,
  rows,
}: {
  concepts: TeacherConcept[];
  rows: { name: string; stages: Record<string, Stage> | null }[];
}) {
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box
        component="table"
        sx={{ borderCollapse: 'collapse', fontSize: 13, '& td, & th': { px: 1, py: 0.5, textAlign: 'left' } }}
      >
        <thead>
          <tr>
            <th />
            {concepts.map((c) => (
              <th key={c.id}>{c.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{r.name}</td>
              {concepts.map((c) => (
                <td key={c.id}>{r.stages ? STAGE_NAMES[r.stages[c.id]] : '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

/** Routed levels with the rule that chose each one (oldest first). */
function RouteList({ trace }: { trace: StudentTrace }) {
  return (
    <Box component="ol" sx={{ m: 0, pl: 3, '& li': { mb: 0.5 } }}>
      {chrono(trace.decisions).map((d, i) => (
        <li key={i}>
          <Typography variant="body2">
            <b>{d.levelCode === '-' ? d.levelTitle : `${d.levelCode} ${d.levelTitle}`}</b>: {d.rule}
          </Typography>
        </li>
      ))}
    </Box>
  );
}
