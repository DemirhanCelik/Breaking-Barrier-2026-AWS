import { useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Box, Button, Chip, CircularProgress, Container, Typography } from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import StarIcon from '@mui/icons-material/Star';
import { api, type StudentTrace, type ValidationRecord } from '../../api';
import { Initials, PaneHeader } from '../../components/brand';
import { brand } from '../../theme';
import { STAGE_NAMES, StageSquare, StatusChip } from './StageCell';
import { TeacherHeader } from './TeacherHeader';

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Per-student trace: placement, roadmap, and why each level was chosen (NFR4). */
export function StudentTracePage() {
  const { studentId = '' } = useParams();
  const [trace, setTrace] = useState<StudentTrace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getStudentTrace(studentId).then(setTrace).catch((e: Error) => setError(e.message));
  }, [studentId]);

  const back = (
    <Button component={RouterLink} to="/teacher" startIcon={<ArrowBackIcon />} sx={{ color: '#fff', mb: 1, ml: -1 }}>
      Class progress
    </Button>
  );

  if (error) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }
  if (!trace) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', flex: 1 }}>
        <CircularProgress aria-label="Loading student" />
      </Box>
    );
  }

  const name = (id: string) => trace.concepts.find((c) => c.id === id)?.name ?? id;

  return (
    <Box sx={{ flex: 1 }}>
      <TeacherHeader
        eyebrow={back}
        title={
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <Initials name={trace.displayName} size={48} />
            {trace.displayName}
          </Box>
        }
        right={
          <Box sx={{ bgcolor: '#fff', color: brand.charcoal, borderRadius: 1.5, px: 2, py: 1.25, display: 'flex', gap: 2, alignItems: 'center' }}>
            <StatusChip status={trace.status} />
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {trace.stepsCompleted} steps done
            </Typography>
          </Box>
        }
      />

      <Container maxWidth="xl" sx={{ py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {trace.flags.map((f, i) => (
          <Box
            key={i}
            role="alert"
            sx={{ display: 'flex', gap: 1.5, alignItems: 'center', px: 2, py: 1.5, borderRadius: 1.5, bgcolor: '#fdecea', border: '1px solid #f3b8b4' }}
          >
            <FlagRoundedIcon sx={{ color: '#d0453f' }} />
            <Typography sx={{ fontWeight: 600 }}>{f}</Typography>
          </Box>
        ))}

        <Panel title="Stage by concept">
          {trace.diagnostic ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
              {trace.concepts.map((c) => {
                const now = trace.stages[c.id];
                const placed = trace.diagnostic![c.id];
                return (
                  <Box key={c.id} sx={{ p: 2, borderRadius: 1.5, bgcolor: brand.bg }}>
                    <Typography sx={{ fontWeight: 700 }}>{c.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {c.csta}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 1.5 }}>
                      <StageSquare stage={placed} size={28} />
                      <Typography color="text.secondary" aria-hidden>
                        →
                      </Typography>
                      <StageSquare stage={now} size={40} belowBar={now < trace.bar} />
                      <Typography sx={{ fontWeight: 700, ml: 0.5 }}>{STAGE_NAMES[now]}</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {c.descriptors[now]}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Typography color="text.secondary">Hasn't started the warm-up yet.</Typography>
          )}
        </Panel>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '5fr 7fr' }, gap: 3 }}>
          <Panel title="Route from here" note={`Planned path to Meeting on every concept. Rebuilt after every result.`}>
            {trace.roadmap.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No remaining steps.
              </Typography>
            ) : (
              <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {trace.roadmap.map((s, i) => {
                  const project = s.targets.length === 0;
                  return (
                    <Box component="li" key={`${s.levelCode}-${i}`} sx={{ display: 'flex', gap: 1.5, position: 'relative', pb: 2 }}>
                      {i < trace.roadmap.length - 1 && (
                        <Box aria-hidden sx={{ position: 'absolute', left: 15, top: 32, bottom: 0, width: 2, bgcolor: brand.borderLight }} />
                      )}
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: project ? 1 : '50%',
                          flexShrink: 0,
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 11,
                          fontWeight: 800,
                          bgcolor: i === 0 ? '#fff' : brand.strip,
                          border: `2px solid ${i === 0 ? brand.orange : brand.border}`,
                        }}
                      >
                        {project ? <StarIcon sx={{ fontSize: 16 }} /> : s.levelCode}
                      </Box>
                      <Box>
                        <Typography sx={{ fontWeight: 600 }}>{s.title}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {project ? 'Project' : `Moves ${s.targets.map(name).join(', ')}`}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Panel>

          <Panel
            title="Why each step was chosen"
            note="The rules list every level that keeps the student on track; with AI-advised routing, the AI picks one of them from the student's evidence. Newest first."
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {trace.decisions.map((d, i) => (
                <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 1.5 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ pt: 0.25 }}>
                    {time(d.at)}
                  </Typography>
                  <Box sx={{ borderLeft: `3px solid ${d.levelCode === '-' ? brand.orange : brand.teal}`, pl: 1.5 }}>
                    <Typography sx={{ fontWeight: 700 }}>
                      {d.levelCode === '-' ? d.levelTitle : `${d.levelCode} · ${d.levelTitle}`}
                    </Typography>
                    {d.advisor?.accepted ? (
                      <>
                        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', my: 0.5 }}>
                          <Chip size="small" icon={<AutoAwesomeOutlinedIcon />} label="AI advisor" color="secondary" variant="outlined" />
                          <Chip
                            size="small"
                            variant="outlined"
                            label={d.advisor.agreed ? 'Same as the rules' : `Rules would pick ${d.advisor.ruleChoice}`}
                          />
                          <Chip size="small" variant="outlined" label={`${d.advisor.candidates.length} allowed: ${d.advisor.candidates.join(', ')}`} />
                        </Box>
                        <Typography variant="body2">{d.advisor.reason}</Typography>
                      </>
                    ) : (
                      <>
                        <Typography variant="body2" color="text.secondary">
                          {d.rule}
                        </Typography>
                        {d.advisor?.note && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            AI advisor: {d.advisor.note}
                          </Typography>
                        )}
                      </>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </Panel>
        </Box>

        <Panel title="Validation evidence" note="Demo mode scores with fixed checks only. Production adds the Bedrock rubric eval.">
          {trace.validations.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No submissions yet.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {trace.validations.map((v, i) => (
                <ValidationRow key={i} v={v} name={name} />
              ))}
            </Box>
          )}
        </Panel>

        <Panel
          title="Extra practice"
          note="Formative only: practice never changes stages or the route. AI-written items passed the safety filter and the quality rubric; otherwise approved practice was served."
        >
          {(trace.practice ?? []).length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No practice rounds yet.
            </Typography>
          ) : (
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {trace.practice.map((p) => (
                <li key={p.id}>
                  <Typography variant="body2">
                    <b>{time(p.at)}</b> · {p.levelCode} · {name(p.conceptId)} {STAGE_NAMES[p.fromStage]} →{' '}
                    {STAGE_NAMES[p.targetStage]} · <i>{p.title}</i> ·{' '}
                    {p.origin === 'generated' ? 'AI-generated' : p.origin === 'bank' ? 'approved draft' : 'authored'} ·{' '}
                    {p.attempts} answer(s)
                  </Typography>
                  {p.origin !== 'generated' && p.fallbackReason && (
                    <Typography variant="caption" color="text.secondary">
                      Fallback reason: {p.fallbackReason}
                    </Typography>
                  )}
                </li>
              ))}
            </Box>
          )}
        </Panel>
      </Container>
    </Box>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Box sx={{ bgcolor: '#fff', borderRadius: 2, border: `1px solid ${brand.borderLight}`, overflow: 'hidden' }}>
      <PaneHeader title={title} />
      <Box sx={{ p: 2.5 }}>
        {note && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {note}
          </Typography>
        )}
        {children}
      </Box>
    </Box>
  );
}

const MODE_LABEL: Record<ValidationRecord['mode'], { label: string; color: string }> = {
  adaptive: { label: 'Scored', color: brand.tealDark },
  fallback: { label: 'Non-adaptive, not scored', color: brand.gray },
  error: { label: 'Validation failed', color: '#d0453f' },
  withheld: { label: 'Withheld by content filter', color: brand.orangeDark },
};

function ValidationRow({ v, name }: { v: ValidationRecord; name: (id: string) => string }) {
  const mode = MODE_LABEL[v.mode];
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '140px 1fr' }, gap: 1.5, pb: 2, borderBottom: `1px solid ${brand.borderLight}`, '&:last-child': { borderBottom: 0, pb: 0 } }}>
      <Box>
        <Typography sx={{ fontWeight: 800 }}>{v.levelCode}</Typography>
        <Typography variant="body2" color="text.secondary">
          {time(v.at)}
        </Typography>
        <Typography variant="caption" sx={{ color: mode.color, fontWeight: 700 }}>
          {mode.label}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {v.results.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {v.mode === 'withheld'
              ? 'The submission was withheld before scoring.'
              : v.mode === 'error'
                ? 'Moved to the non-adaptive path.'
                : 'Work accepted on the non-adaptive path.'}
          </Typography>
        )}
        {v.results.map((r) => (
          <Box key={r.conceptId}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 700 }}>{name(r.conceptId)}</Typography>
              <StageSquare stage={r.fromStage} size={22} />
              <Typography variant="body2" color="text.secondary">
                → target
              </Typography>
              <StageSquare stage={r.targetStage} size={22} />
              <Typography variant="body2" sx={{ fontWeight: 700, color: r.passed ? '#3d9b5f' : brand.orangeDark }}>
                {r.passed ? 'Met' : 'Not yet'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75 }}>
              {r.evidence.map((e) => {
                const met = e.startsWith('Met') || e.startsWith('Seeded');
                return (
                  <Box
                    key={e}
                    sx={{
                      fontSize: 12.5,
                      px: 1,
                      py: 0.25,
                      borderRadius: 1,
                      bgcolor: met ? '#e7f5ec' : '#fff4e0',
                      color: brand.charcoal,
                    }}
                  >
                    {e.replace(/^(Met|Not yet): /, met ? '✓ ' : '○ ')}
                  </Box>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
