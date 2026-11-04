import { useEffect, useState } from 'react';
import { Alert, Box, Button, Container, Typography } from '@mui/material';
import { demoControls, type UnitInfo } from '../../api';
import { TeacherHeader } from './TeacherHeader';

export function CoursesPage() {
  const [catalog, setCatalog] = useState<{ current: string; units: UnitInfo[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { demoControls?.getUnits().then(setCatalog).catch(() => setError('Could not load courses. Please refresh to try again.')); }, []);
  async function assign(course: UnitInfo) {
    if (!demoControls) return;
    setBusy(true); setError('');
    try { await demoControls.setUnit(course.id); window.location.assign('/teacher'); }
    catch { setError('Could not assign this course. Your current course is unchanged.'); setBusy(false); }
  }
  return <Box><TeacherHeader title="Courses" subtitle="Browse the authored curriculum and choose a course for your class." /><Container maxWidth="lg" sx={{ py: 4 }}>
    {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
    <Alert severity="info" sx={{ mb: 3 }}>Choose the assigned course for your class. Students can explore other courses and keep their saved progress.</Alert>
    {!demoControls && <Typography>Course assignment is unavailable in this environment.</Typography>}
    {demoControls && !catalog && !error && <Typography role="status">Loading courses…</Typography>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3 }}>{catalog?.units.map((course) => <Box key={course.id} sx={{ border: '1px solid #ccc', bgcolor: '#fff', display: 'flex', flexDirection: 'column' }}><Box sx={{ bgcolor: catalog.current === course.id ? '#0093a4' : '#7665a0', height: 8 }} /><Box sx={{ p: 3, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><Typography variant="h2">{course.name}</Typography><Typography color="text.secondary" sx={{ flex: 1 }}>{course.summary}</Typography><Button variant={catalog.current === course.id ? 'outlined' : 'contained'} disabled={busy || catalog.current === course.id} onClick={() => void assign(course)}>{catalog.current === course.id ? 'Assigned to your class' : 'Assign course'}</Button></Box></Box>)}</Box>
  </Container></Box>;
}
