import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import RefreshIcon from '@mui/icons-material/Refresh';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { api, type ClassAttainment } from '../../api';
import { Initials } from '../../components/brand';
import { brand } from '../../theme';
import { StageCell, StageLegend, StatusChip } from './StageCell';
import { HeaderStat, TeacherHeader } from './TeacherHeader';

/** Read-only, teacher-only attainment view (FR12). */
export function TeacherDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ClassAttainment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.getClassAttainment().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  if (error) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">Could not load class attainment: {error}</Alert>
      </Container>
    );
  }
  if (!data) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', flex: 1 }}>
        <CircularProgress aria-label="Loading class" />
      </Box>
    );
  }

  const started = data.students.filter((s) => s.diagnostic);
  const metBar = started.filter((s) => data.concepts.every((c) => s.stages[c.id] >= data.bar)).length;
  const flagged = data.students.filter((s) => s.flags.length > 0 || s.status === 'needs-attention').length;

  return (
    <Box sx={{ flex: 1 }}>
      <TeacherHeader
        eyebrow="AI-Generated Design · Robotics Club Page"
        title={data.className}
        subtitle="Everyone reaches Meeting on every concept. Exceeding is optional depth. Students never see this page."
        right={
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <HeaderStat label="started" value={`${started.length}/${data.students.length}`} />
            <HeaderStat label="at the bar" value={metBar} />
            <HeaderStat label="flagged" value={flagged} />
          </Box>
        }
      />

      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
          <StageLegend bar={data.bar} />
          <Box sx={{ flex: 1 }} />
          <Button startIcon={<ShieldOutlinedIcon />} onClick={() => navigate('/teacher/safety')} sx={{ color: brand.charcoal }}>
            Safety log
          </Button>
          <Button startIcon={<RefreshIcon />} onClick={load} sx={{ color: brand.charcoal }}>
            Refresh
          </Button>
        </Box>

        <TableContainer sx={{ bgcolor: '#fff', borderRadius: 2, border: `1px solid ${brand.borderLight}` }}>
          <Table aria-label="Stage per concept for each student">
            <TableHead>
              <TableRow>
                <TableCell sx={{ position: 'sticky', left: 0, zIndex: 1, minWidth: 200 }}>Student</TableCell>
                <TableCell>Status</TableCell>
                {data.concepts.map((c) => (
                  <TableCell key={c.id} sx={{ minWidth: 150 }}>
                    <Tooltip title={`${c.csta}. Meeting: ${c.descriptors[data.bar]}`}>
                      <Box>
                        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{c.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {c.csta}
                        </Typography>
                      </Box>
                    </Tooltip>
                  </TableCell>
                ))}
                <TableCell align="right">Steps</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {data.students.map((s) => (
                <TableRow
                  key={s.studentId}
                  hover
                  onClick={() => navigate(`/teacher/students/${s.studentId}`)}
                  sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                >
                  <TableCell sx={{ position: 'sticky', left: 0, bgcolor: '#fff' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Initials name={s.displayName} size={34} />
                      <Typography sx={{ fontWeight: 700 }}>{s.displayName}</Typography>
                      {s.flags.length > 0 && (
                        <Tooltip title={s.flags.join(' ')}>
                          <FlagRoundedIcon sx={{ color: '#d0453f', fontSize: 18 }} aria-label={`${s.flags.length} flag(s)`} />
                        </Tooltip>
                      )}
                    </Box>
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
                          Not started
                        </Typography>
                      )}
                    </TableCell>
                  ))}
                  <TableCell align="right">
                    <Typography sx={{ fontWeight: 700 }}>{s.stepsCompleted}</Typography>
                  </TableCell>
                  <TableCell padding="checkbox">
                    <ChevronRightIcon sx={{ color: brand.border }} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          Select a student to see their route and why each step was chosen.
        </Typography>
      </Container>
    </Box>
  );
}
