import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Chip, CircularProgress, Container, Link, Tooltip, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { api, type ClassInsights, type MiniLesson, type SkillGroup } from '../../api';
import { brand } from '../../theme';
import { STAGE_NAMES } from './StageCell';
import { HeaderStat, TeacherHeader } from './TeacherHeader';

const STAGE_COLORS = ['#d0453f', '#f2a33a', brand.teal, brand.purple];

/**
 * Differentiation help for one teacher with a mixed class: who needs help right
 * now (with plain reasons), small groups of students who share the same missing
 * skill, and a one-click 5-minute mini-lesson for each group.
 */
export function InsightsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ClassInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .getInsights()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (error) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">Could not load insights: {error}</Alert>
      </Container>
    );
  }
  if (!data) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', flex: 1 }}>
        <CircularProgress aria-label="Loading insights" />
      </Box>
    );
  }

  const groups = data.groups.filter((g) => g.students.length > 1);
  const singles = data.groups.filter((g) => g.students.length === 1);

  return (
    <Box sx={{ flex: 1 }}>
      <TeacherHeader
        eyebrow="Differentiation · right now"
        title="Class insights"
        subtitle="Who needs you now, and which students share a gap so you can teach them together. Students never see this page."
        right={
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <HeaderStat label="need help now" value={data.needsHelp.length} />
            <HeaderStat label="small groups" value={groups.length} />
          </Box>
        }
      />

      <Container maxWidth="lg" sx={{ py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/teacher')} sx={{ color: brand.charcoal }}>
            Class
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button startIcon={<RefreshIcon />} onClick={load} sx={{ color: brand.charcoal }}>
            Refresh
          </Button>
        </Box>

        <Section
          title="Needs help now"
          note="Fixed, explainable rules: repeated misses, several attempts, a long time on a step, or many rewrites."
        >
          {data.needsHelp.length === 0 ? (
            <Typography color="text.secondary">Nobody is stuck right now.</Typography>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
              {data.needsHelp.map((h) => (
                <Box
                  key={h.studentId}
                  sx={{ border: `1px solid #f3b8b4`, bgcolor: '#fff7f6', borderRadius: 1.5, p: 1.5 }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                    <FlagRoundedIcon sx={{ color: '#d0453f', fontSize: 18 }} />
                    <Link
                      component={RouterLink}
                      to={`/teacher/students/${h.studentId}`}
                      sx={{ fontWeight: 800, color: brand.charcoal }}
                    >
                      {h.displayName}
                    </Link>
                    {h.levelCode && (
                      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }} noWrap>
                        on {h.levelCode} · {h.levelTitle}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    {h.reasons.map((r) => (
                      <Chip key={r} size="small" label={r} variant="outlined" />
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Section>

        <Section
          title="Small groups"
          note="Students whose latest attempt is missing the same skill. Pull them together for 5 minutes instead of re-teaching one by one."
        >
          {groups.length === 0 ? (
            <Typography color="text.secondary">No shared gaps yet.</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {groups.map((g) => (
                <GroupCard key={g.checkId} group={g} />
              ))}
            </Box>
          )}
          {singles.length > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              One student each: {singles.map((g) => `${g.skill} (${g.students[0].displayName})`).join('; ')}.
            </Typography>
          )}
        </Section>

        <Section title="Where the class is" note="Students per stage on each concept. Everyone works toward Meeting.">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {data.concepts.map((c) => {
              const total = c.byStage.reduce((a, b) => a + b, 0) || 1;
              return (
                <Box
                  key={c.conceptId}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '200px 1fr' },
                    gap: 1,
                    alignItems: 'center',
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {c.name}
                  </Typography>
                  <Box sx={{ display: 'flex', height: 22, borderRadius: 1, overflow: 'hidden', bgcolor: '#f1f3f5' }}>
                    {c.byStage.map((n, st) =>
                      n ? (
                        <Tooltip key={st} title={`${STAGE_NAMES[st as 0 | 1 | 2 | 3]}: ${n}`}>
                          <Box
                            sx={{
                              width: `${(n / total) * 100}%`,
                              bgcolor: STAGE_COLORS[st],
                              color: '#fff',
                              fontSize: 12,
                              fontWeight: 700,
                              display: 'grid',
                              placeItems: 'center',
                            }}
                          >
                            {n}
                          </Box>
                        </Tooltip>
                      ) : null,
                    )}
                  </Box>
                </Box>
              );
            })}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 0.5 }}>
              {[0, 1, 2, 3].map((st) => (
                <Box key={st} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: STAGE_COLORS[st] }} />
                  <Typography variant="caption">{STAGE_NAMES[st as 0 | 1 | 2 | 3]}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Section>
      </Container>
    </Box>
  );
}

function GroupCard({ group }: { group: SkillGroup }) {
  const [lesson, setLesson] = useState<MiniLesson | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = async () => {
    setBusy(true);
    setError(null);
    try {
      setLesson(await api.getMiniLesson(group.checkId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ border: `1px solid ${brand.borderLight}`, borderRadius: 1.5, p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <GroupsOutlinedIcon sx={{ color: brand.purple }} />
        <Typography sx={{ fontWeight: 800 }}>{group.skill}</Typography>
        <Chip size="small" label={group.conceptName} />
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant={lesson ? 'text' : 'contained'}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeOutlinedIcon />}
          onClick={() => void plan()}
          disabled={busy}
        >
          {lesson ? 'New mini-lesson' : 'Plan a 5-min mini-lesson'}
        </Button>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
        {group.students.map((s) => (
          <Chip
            key={s.studentId}
            size="small"
            variant="outlined"
            label={s.displayName}
            component={RouterLink}
            to={`/teacher/students/${s.studentId}`}
            clickable
          />
        ))}
      </Box>
      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
      {lesson && (
        <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#f7f5fc', borderRadius: 1.5 }}>
          <Typography sx={{ fontWeight: 800, mb: 0.5 }}>{lesson.title}</Typography>
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            <b>Goal:</b> {lesson.goal}
          </Typography>
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            <b>Warm-up:</b> {lesson.warmup}
          </Typography>
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            <b>Example:</b> {lesson.example}
          </Typography>
          <Typography variant="body2" component="div" sx={{ mb: 0.5 }}>
            <b>Try it:</b>
            <Box component="ol" sx={{ m: 0, pl: 3 }}>
              {lesson.tryIt.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </Box>
          </Typography>
          <Typography variant="body2">
            <b>Check:</b> {lesson.check}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
            {lesson.source === 'ai'
              ? 'Drafted by AI and safety-filtered. Adapt it to your class.'
              : (lesson.note ?? 'Authored outline.')}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <Box
      component="section"
      sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 2, p: 2.5 }}
    >
      <Typography variant="h2" sx={{ fontSize: '1.15rem', mb: 0.25 }}>
        {title}
      </Typography>
      {note && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {note}
        </Typography>
      )}
      {children}
    </Box>
  );
}
