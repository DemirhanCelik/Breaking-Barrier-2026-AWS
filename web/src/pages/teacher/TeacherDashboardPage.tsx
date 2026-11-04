import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Chip,
  TextField,
  InputAdornment,
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
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { Link as RouterLink } from 'react-router-dom';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import RefreshIcon from '@mui/icons-material/Refresh';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { api, demoControls, type ClassAttainment } from '../../api';
import { Initials } from '../../components/brand';
import { brand } from '../../theme';
import { StageCell, StageLegend, StatusChip } from './StageCell';
import { HeaderStat, TeacherHeader } from './TeacherHeader';

/** Read-only, teacher-only attainment view (FR12). */
export function TeacherDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ClassAttainment | null>(null);
  const [filter, setFilter] = useState<'all' | 'support' | 'not-started' | 'met'>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setRefreshing(true);
    api.getClassAttainment().then(setData).catch((e: Error) => setError(e.message)).finally(() => setRefreshing(false));
  }, []);

  useEffect(load, [load]);

  if (error && !data) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="warning" action={<Button color="inherit" onClick={load}>Try again</Button>}>Your class overview couldn’t load. Please try again.</Alert>
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
  const needsSupport = data.students.filter((s) => s.flags.length > 0 || s.status === 'needs-attention' || s.status === 'fallback');
  const flagged = needsSupport.length;
  const visibleStudents = data.students.filter((student) => {
    if (!student.displayName.toLowerCase().includes(search.trim().toLowerCase())) return false;
    switch (filter) {
      case 'support': return needsSupport.some((s) => s.studentId === student.studentId);
      case 'not-started': return !student.diagnostic;
      case 'met': return student.diagnostic !== null && data.concepts.every((c) => student.stages[c.id] >= data.bar);
      default: return true;
    }
  });

  return (
    <Box sx={{ flex: 1 }}>
      <TeacherHeader
        eyebrow={data.unit?.name ?? 'Class'}
        title={data.className}
        subtitle="A shared goal. Individual paths. See where a little support can make a difference."
        right={
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <HeaderStat label="started" value={`${started.length}/${data.students.length}`} />
            <HeaderStat label="meeting all goals" value={metBar} />
            <HeaderStat label="need attention" value={flagged} />
          </Box>
        }
      />

      <Container maxWidth="xl" sx={{ py: 3 }}>
        {demoControls && <Alert severity="info" sx={{ mb: 3 }}>Browse and assign curriculum from the Courses tab. Each course keeps its own student progress.</Alert>}
        {error && <Alert severity="warning" sx={{ mb: 2 }}>Couldn’t refresh. Showing the last loaded class overview. Try again in a moment.</Alert>}
        {needsSupport.length > 0 && <Box component="section" aria-label="Students to check in with" sx={{ mb: 4, bgcolor: '#fff', p: { xs: 2, md: 3 }, borderRadius: 3, border: `1px solid ${brand.borderLight}` }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 2 }}><Box><Typography variant="overline" sx={{ color: '#94611a' }}>A GOOD PLACE TO START</Typography><Typography variant="h2">A few check-ins could help.</Typography></Box><Button component={RouterLink} to="/teacher/insights" endIcon={<ChevronRightIcon />}>Plan support</Button></Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            {needsSupport.map((s) => <Box key={s.studentId} sx={{ p: 2, bgcolor: '#faf8f1', border: '1px solid #ece6d7', borderRadius: 2, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}><Initials name={s.displayName} size={36} /><Box sx={{ flex: 1 }}><Typography fontWeight={700}>{s.displayName}</Typography><Typography variant="body2" color="text.secondary">{s.status === 'fallback' ? 'Continuing on the guided path. Check whether they need support.' : s.flags[0] ?? 'Their recent work suggests a check-in would help.'}</Typography><Button component={RouterLink} to={`/teacher/students/${s.studentId}`} size="small" sx={{ px: 0, mt: 0.5 }}>Review learning path <ChevronRightIcon fontSize="small" /></Button></Box></Box>)}
          </Box>
        </Box>}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
          <Box><Typography variant="h2" sx={{ mb: 0.5 }}>Your class at a glance</Typography><Typography variant="body2" color="text.secondary">Select a learner to understand their path and next steps.</Typography></Box>
          <Box sx={{ flex: 1 }} />
          <Button disabled={refreshing} startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshIcon />} onClick={load} sx={{ color: brand.charcoal }}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
          <Box role="group" aria-label="Filter students" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', flex: 1 }}>
            {([{ id: 'all', label: `All students · ${data.students.length}` }, { id: 'support', label: `Need support · ${flagged}` }, { id: 'not-started', label: `Not started · ${data.students.length - started.length}` }, { id: 'met', label: `Meeting goals · ${metBar}` }] as const).map((item) => <Chip key={item.id} label={item.label} onClick={() => setFilter(item.id)} color={filter === item.id ? 'primary' : 'default'} variant={filter === item.id ? 'filled' : 'outlined'} aria-pressed={filter === item.id} />)}
          </Box>
          <TextField size="small" placeholder="Find a student" value={search} onChange={(e) => setSearch(e.target.value)} inputProps={{ 'aria-label': 'Find a student' }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }} sx={{ bgcolor: '#fff', width: { xs: '100%', sm: 240 } }} />
        </Box>
        <Typography variant="body2" role="status" color="text.secondary" sx={{ mb: 2 }}>{visibleStudents.length} of {data.students.length} students shown</Typography>
        <Box sx={{ mb: 2 }}><StageLegend bar={data.bar} /></Box>
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
                          {c.csta.split(/[ (,]/)[0]}
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
              {visibleStudents.map((s) => (
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
                    <Button size="small" aria-label={`View ${s.displayName}'s learning path`} onClick={(e) => { e.stopPropagation(); navigate(`/teacher/students/${s.studentId}`); }}><ChevronRightIcon /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {visibleStudents.length === 0 && <TableRow><TableCell colSpan={data.concepts.length + 4}><Box sx={{ textAlign: 'center', py: 4 }}><Typography fontWeight={700}>No students match this view.</Typography><Typography variant="body2" color="text.secondary">Try another name or reset your filters.</Typography><Button onClick={() => { setSearch(''); setFilter('all'); }}>Show all students</Button></Box></TableCell></TableRow>}
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
