import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Container, Link, Tooltip, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { api, type ClassPaths, type PathLevel, type PathState, type StudentPath } from '../../api';
import { brand } from '../../theme';
import { StageSquare } from './StageCell';
import { HeaderStat, TeacherHeader } from './TeacherHeader';

const CELL = 30;

const STATE_INFO: Record<PathState, { label: string; help: string }> = {
  done: { label: 'Done', help: 'Passed this step.' },
  'moved-on': { label: 'Moved on', help: 'Used the tries on this step, then the rules routed around it.' },
  current: { label: 'Working on it', help: 'The step the student is on now.' },
  ahead: { label: 'Coming up', help: 'Where the rules will route next, given what the student shows so far.' },
  skipped: { label: 'Not needed', help: 'Placement or another step already covers what this step teaches.' },
};

const STATUS_NOTE: Partial<Record<StudentPath['status'], string>> = {
  fallback: 'On the guided (fixed-order) path',
  'needs-attention': 'Needs a check-in',
};

/** The rule text without the advisor's reason (shown separately) and the raw stage vector. */
const shortRule = (rule: string) => rule.split(/ (?:Reason|Vector): /)[0];

/** Ordered codes of the steps on a student's route (done, current, ahead). */
const routeOf = (s: StudentPath) =>
  Object.entries(s.path)
    .filter(([, v]) => v.order != null)
    .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
    .map(([code]) => code);

/**
 * Teacher-only view of how the adaptive engine routes each student: one row per
 * student, one column per authored step. Students never see this comparison;
 * their own view has no levels, counts, or rankings.
 */
export function PathsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ClassPaths | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .getClassPaths()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const stats = useMemo(() => {
    if (!data) return null;
    const started = data.students.filter((s) => s.diagnostic);
    const distinct = new Set(started.map((s) => routeOf(s).join('>'))).size;
    const tasks = data.levels.filter((l) => !l.project).length;
    const avgSteps = started.length ? started.reduce((n, s) => n + routeOf(s).length, 0) / started.length : 0;
    return { started: started.length, distinct, tasks, avgSteps };
  }, [data]);

  if (error) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error" action={<Button color="inherit" onClick={load}>Try again</Button>}>
          Could not load learning paths: {error}
        </Alert>
      </Container>
    );
  }
  if (!data || !stats) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', p: 6 }}>
        <CircularProgress aria-label="Loading learning paths" />
      </Box>
    );
  }

  const conceptName = (id: string) => data.concepts.find((c) => c.id === id)?.name ?? id;

  return (
    <Box sx={{ bgcolor: brand.bg, minHeight: '100%' }}>
      <TeacherHeader
        eyebrow={data.unit?.name ?? 'Learning paths'}
        title="Learning paths"
        subtitle="Each student’s route through this unit, chosen from their warm-up and their work so far."
        right={
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <HeaderStat label={`different paths for ${stats.started} students`} value={stats.distinct} />
            <HeaderStat label={`steps on average (of ${stats.tasks + 1})`} value={stats.avgSteps.toFixed(1)} />
          </Box>
        }
      />

      <Container maxWidth="xl" sx={{ py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 0.75,
              borderRadius: 1.5,
              bgcolor: '#f1eef8',
              color: brand.charcoal,
            }}
          >
            <VisibilityOffOutlinedIcon sx={{ fontSize: 18, color: brand.purple }} />
            <Typography variant="body2">
              Teacher-only. Students see just their own next step, never levels, counts, or each other.
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Legend />
          <Button startIcon={<RefreshIcon />} onClick={load} sx={{ color: brand.charcoal }}>
            Refresh
          </Button>
        </Box>

        <Box
          sx={{
            bgcolor: '#fff',
            border: `1px solid ${brand.borderLight}`,
            borderRadius: 2,
            overflowX: 'auto',
          }}
        >
          <Box
            role="table"
            aria-label="Learning path for each student"
            sx={{
              display: 'grid',
              gridTemplateColumns: `minmax(210px, 1.4fr) repeat(${data.levels.length}, ${CELL + 14}px) minmax(90px, 0.5fr)`,
              minWidth: 'max-content',
            }}
          >
            <Box role="row" sx={{ display: 'contents' }}>
              <HeadCell left>Student · starting point</HeadCell>
              {data.levels.map((l) => (
                <HeadCell key={l.code}>
                  <Tooltip title={<LevelTip level={l} conceptName={conceptName} />} arrow>
                    <Box component="span" tabIndex={0} sx={{ cursor: 'help' }}>
                      {l.code}
                    </Box>
                  </Tooltip>
                </HeadCell>
              ))}
              <HeadCell>Steps</HeadCell>
            </Box>

            {data.students.map((s) => (
              <Box
                role="row"
                key={s.studentId}
                onClick={() => navigate(`/teacher/students/${s.studentId}`)}
                sx={{
                  display: 'contents',
                  cursor: 'pointer',
                  '&:hover > *': { bgcolor: '#faf8f1' },
                }}
              >
                <Box role="cell" sx={{ ...rowCell, justifyContent: 'flex-start', gap: 1.25, px: 2 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Link
                      component={RouterLink}
                      to={`/teacher/students/${s.studentId}`}
                      onClick={(e) => e.stopPropagation()}
                      sx={{ fontWeight: 700, color: brand.charcoal }}
                    >
                      {s.displayName}
                    </Link>
                    {STATUS_NOTE[s.status] && (
                      <Typography variant="caption" display="block" sx={{ color: '#94611a', fontWeight: 600 }}>
                        {STATUS_NOTE[s.status]}
                      </Typography>
                    )}
                    {s.diagnostic ? (
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }} aria-label="Warm-up placement">
                        {data.concepts.map((c) => (
                          <Tooltip key={c.id} title={`${c.name}: started at stage ${s.diagnostic?.[c.id] ?? 0}`}>
                            <Box>
                              <StageSquare stage={s.diagnostic?.[c.id] ?? 0} size={18} />
                            </Box>
                          </Tooltip>
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.secondary" display="block">
                        Hasn’t taken the warm-up
                      </Typography>
                    )}
                  </Box>
                </Box>
                {data.levels.map((l) => (
                  <Box role="cell" key={l.code} sx={rowCell}>
                    {s.diagnostic && s.path[l.code] && <PathDot level={l} cell={s.path[l.code]} />}
                  </Box>
                ))}
                <Box role="cell" sx={{ ...rowCell, fontWeight: 700 }}>
                  {s.diagnostic ? routeOf(s).length : '–'}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>

        <Box>
          <Typography variant="h2" sx={{ fontSize: '1.3rem', mb: 0.5 }}>
            Why each student is on their current step
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            The latest routing decision. The rules decide which steps are allowed; the AI advisor picks among them and
            explains why.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5, alignItems: 'start' }}>
            {data.students
              .filter((s) => s.why)
              .map((s) => {
                const level = data.levels.find((l) => l.code === s.why!.levelCode);
                return (
                  <Box
                    key={s.studentId}
                    sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 1.5, p: 1.75 }}
                  >
                    <Typography sx={{ fontWeight: 700 }}>
                      {s.displayName}{' '}
                      <Typography component="span" color="text.secondary" sx={{ fontWeight: 500 }}>
                        → {s.why!.levelCode}
                        {level ? ` · ${level.title}` : ''}
                      </Typography>
                    </Typography>
                    {s.why!.advisor && (
                      <Typography variant="body2" sx={{ mt: 0.75, color: brand.charcoal }}>
                        <Box component="span" sx={{ fontWeight: 700, color: brand.purple }}>
                          AI advisor:{' '}
                        </Box>
                        {s.why!.advisor}
                      </Typography>
                    )}
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                      <Box component="span" sx={{ fontWeight: 700 }}>
                        Rules:{' '}
                      </Box>
                      {shortRule(s.why!.rule)}
                    </Typography>
                  </Box>
                );
              })}
          </Box>
        </Box>
      </Container>
    </Box>
  );
}

const rowCell = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  py: 1.25,
  borderTop: `1px solid ${brand.borderLight}`,
  transition: 'background-color 120ms',
} as const;

function HeadCell({ children, left }: { children: React.ReactNode; left?: boolean }) {
  return (
    <Box
      role="columnheader"
      sx={{
        px: left ? 2 : 0,
        py: 1.25,
        textAlign: left ? 'left' : 'center',
        fontSize: 12.5,
        fontWeight: 800,
        color: brand.gray,
        letterSpacing: 0.3,
        bgcolor: '#fbfaf7',
      }}
    >
      {children}
    </Box>
  );
}

function LevelTip({ level, conceptName }: { level: PathLevel; conceptName: (id: string) => string }) {
  return (
    <Box>
      <Box sx={{ fontWeight: 700 }}>
        {level.code} · {level.title}
      </Box>
      {level.teaches.map((t, i) => (
        <Box key={i}>
          {conceptName(t.conceptId)}: stage {t.from} → {t.to}
        </Box>
      ))}
    </Box>
  );
}

function dotStyle(state: PathState) {
  switch (state) {
    case 'done':
      return { bgcolor: brand.teal, color: brand.charcoal, border: `2px solid ${brand.teal}` };
    case 'moved-on':
      return { bgcolor: '#fff4e0', color: '#94611a', border: `2px solid #f2a33a` };
    case 'current':
      return { bgcolor: brand.purple, color: '#fff', border: `2px solid ${brand.purple}`, boxShadow: `0 0 0 3px #d9d1ee` };
    case 'ahead':
      return { bgcolor: '#fff', color: brand.gray, border: `2px dashed ${brand.border}` };
    default:
      return null;
  }
}

function PathDot({ level, cell }: { level: PathLevel; cell: { state: PathState; order?: number } }) {
  const style = dotStyle(cell.state);
  const info = STATE_INFO[cell.state];
  const tip = `${level.code} · ${level.title}: ${info.label}. ${info.help}`;
  if (!style) {
    return (
      <Tooltip title={tip}>
        <Box aria-label={tip} sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#e6e2d8' }} />
      </Tooltip>
    );
  }
  return (
    <Tooltip title={tip}>
      <Box
        aria-label={tip}
        sx={{
          width: CELL,
          height: CELL,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          fontSize: 12.5,
          fontWeight: 800,
          ...style,
        }}
      >
        {cell.order}
      </Box>
    </Tooltip>
  );
}

function Legend() {
  const items: PathState[] = ['done', 'current', 'ahead', 'moved-on', 'skipped'];
  return (
    <Box sx={{ display: 'flex', gap: 1.75, flexWrap: 'wrap', alignItems: 'center' }} aria-label="Legend">
      {items.map((st) => {
        const style = dotStyle(st);
        return (
          <Box key={st} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {style ? (
              <Box sx={{ width: 16, height: 16, borderRadius: '50%', ...style, boxShadow: 'none' }} />
            ) : (
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#e6e2d8' }} />
            )}
            <Typography variant="body2">{STATE_INFO[st].label}</Typography>
          </Box>
        );
      })}
    </Box>
  );
}
