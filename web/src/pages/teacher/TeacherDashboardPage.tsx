import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Grid,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import { api, type ClassAttainment } from '../../api';
import { StageCell, StatusChip } from './StageCell';

/** Read-only, teacher-only attainment view (FR12). */
export function TeacherDashboardPage() {
  const [data, setData] = useState<ClassAttainment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.getClassAttainment().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  if (error) return <Alert severity="error">Could not load class attainment: {error}</Alert>;
  if (!data) return <CircularProgress aria-label="Loading class" />;

  const started = data.students.filter((s) => s.diagnostic);
  const metBar = started.filter((s) => data.concepts.every((c) => s.stages[c.id] >= data.bar)).length;
  const flagged = data.students.filter((s) => s.flags.length > 0 || s.status === 'needs-attention').length;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'flex-end' }} spacing={2}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="overline" color="secondary">
            Teacher view
          </Typography>
          <Typography variant="h1">{data.className}</Typography>
          <Typography color="text.secondary">
            Bar: Stage {data.bar} (Meeting) on every concept. Stage 3 is optional depth. Students never see this page.
          </Typography>
        </Box>
        <Button startIcon={<RefreshIcon />} onClick={load} variant="outlined">
          Refresh
        </Button>
      </Stack>

      <Grid container spacing={2}>
        <Summary label="Started" value={`${started.length} / ${data.students.length}`} />
        <Summary label="At the bar on every concept" value={`${metBar}`} />
        <Summary label="Flagged for you" value={`${flagged}`} />
      </Grid>

      <TableContainer component={Paper}>
        <Table size="small" aria-label="Per-concept stage for each student">
          <TableHead>
            <TableRow>
              <TableCell>Student</TableCell>
              <TableCell>Status</TableCell>
              {data.concepts.map((c) => (
                <TableCell key={c.id}>
                  <Tooltip title={`${c.csta}. Stage ${data.bar}: ${c.descriptors[data.bar]}`}>
                    <span>{c.name}</span>
                  </Tooltip>
                </TableCell>
              ))}
              <TableCell align="right">Steps</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {data.students.map((s) => (
              <TableRow key={s.studentId} hover>
                <TableCell>
                  <Link component={RouterLink} to={`/teacher/students/${s.studentId}`} fontWeight={600}>
                    {s.displayName}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusChip status={s.status} />
                </TableCell>
                {data.concepts.map((c) => (
                  <TableCell key={c.id}>
                    {s.diagnostic ? (
                      <StageCell stage={s.stages[c.id]} placed={s.diagnostic[c.id]} bar={data.bar} concept={c} />
                    ) : (
                      <Typography variant="body2" color="text.disabled">
                        -
                      </Typography>
                    )}
                  </TableCell>
                ))}
                <TableCell align="right">{s.stepsCompleted}</TableCell>
                <TableCell>
                  {s.flags.length > 0 && (
                    <Tooltip title={s.flags.join(' ')}>
                      <FlagOutlinedIcon color="error" fontSize="small" aria-label={`${s.flags.length} flag(s)`} />
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <Grid size={{ xs: 12, sm: 4 }}>
      <Paper sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h2">{value}</Typography>
      </Paper>
    </Grid>
  );
}
