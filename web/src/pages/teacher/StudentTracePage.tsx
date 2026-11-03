import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { api, type StudentTrace } from '../../api';
import { StageCell, StatusChip } from './StageCell';

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
    <Button component={RouterLink} to="/teacher" startIcon={<ArrowBackIcon />} sx={{ alignSelf: 'flex-start' }}>
      Back to class
    </Button>
  );

  if (error) return <Stack spacing={2}>{back}<Alert severity="error">{error}</Alert></Stack>;
  if (!trace) return <CircularProgress aria-label="Loading student" />;

  const name = (id: string) => trace.concepts.find((c) => c.id === id)?.name ?? id;

  return (
    <Stack spacing={3}>
      {back}
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="h1">{trace.displayName}</Typography>
        <StatusChip status={trace.status} />
        <Typography color="text.secondary">{trace.stepsCompleted} steps done</Typography>
      </Stack>

      {trace.flags.map((f, i) => (
        <Alert key={i} severity="warning">
          {f}
        </Alert>
      ))}

      <Paper sx={{ p: 2.5 }}>
        <Typography variant="h3" gutterBottom>
          Stage by concept
        </Typography>
        {trace.diagnostic ? (
          <Grid container spacing={2}>
            {trace.concepts.map((c) => (
              <Grid key={c.id} size={{ xs: 6, md: 3 }}>
                <Typography variant="body2" fontWeight={600} gutterBottom>
                  {c.name}
                </Typography>
                <StageCell stage={trace.stages[c.id]} placed={trace.diagnostic![c.id]} bar={trace.bar} concept={c} />
              </Grid>
            ))}
          </Grid>
        ) : (
          <Typography color="text.secondary">Has not started the warm-up yet.</Typography>
        )}
      </Paper>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="h3">Roadmap from here</Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Planned route to Stage {trace.bar} on every concept. It is rebuilt after every result.
            </Typography>
            <List dense>
              {trace.roadmap.map((s, i) => (
                <ListItem key={`${s.levelCode}-${i}`} disableGutters alignItems="flex-start">
                  <Chip size="small" label={s.levelCode} sx={{ mr: 1.5, mt: 0.5 }} />
                  <ListItemText
                    primary={s.title}
                    secondary={s.targets.length ? `Advances: ${s.targets.map(name).join(', ')}` : 'Project'}
                  />
                </ListItem>
              ))}
              {trace.roadmap.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No remaining steps.
                </Typography>
              )}
            </List>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Paper sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="h3">Why each step was chosen</Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Routing is deterministic. Each entry shows the rule and the stage vector it used. Newest first.
            </Typography>
            <List dense>
              {trace.decisions.map((d, i) => (
                <ListItem key={i} disableGutters alignItems="flex-start">
                  <ListItemText
                    primary={`${time(d.at)} · ${d.levelCode === '-' ? d.levelTitle : `${d.levelCode} ${d.levelTitle}`}`}
                    secondary={d.rule}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2.5 }}>
        <Typography variant="h3">Validation evidence</Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Demo mode scores with deterministic probes only. Production adds the Bedrock rubric eval.
        </Typography>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {trace.validations.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No submissions yet.
            </Typography>
          )}
          {trace.validations.map((v, i) => (
            <Box key={i} sx={{ borderLeft: '3px solid', borderColor: 'divider', pl: 1.5 }}>
              <Typography variant="body2" fontWeight={600}>
                {time(v.at)} · {v.levelCode} · {v.mode}
              </Typography>
              {v.mode === 'withheld' && (
                <Typography variant="body2" color="text.secondary">
                  Content filter withheld the submission.
                </Typography>
              )}
              {v.mode === 'error' && (
                <Typography variant="body2" color="text.secondary">
                  Validation failed. Student moved to the non-adaptive path.
                </Typography>
              )}
              {v.mode === 'fallback' && (
                <Typography variant="body2" color="text.secondary">
                  Accepted on the non-adaptive path. Not scored.
                </Typography>
              )}
              {v.results.map((r) => (
                <Box key={r.conceptId} sx={{ mt: 0.5 }}>
                  <Typography variant="body2">
                    {name(r.conceptId)}: {r.fromStage}→{r.targetStage}, observed {r.observedStage}{' '}
                    <Chip size="small" label={r.passed ? 'met' : 'not yet'} color={r.passed ? 'success' : 'default'} />
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {r.evidence.join(' · ')}
                  </Typography>
                </Box>
              ))}
            </Box>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}
