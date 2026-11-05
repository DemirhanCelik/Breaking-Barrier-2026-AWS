import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography,
} from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { api, ApiError, type CourseInfo, type LessonState } from '../../api';
import { useSession } from '../../session';
import { brand } from '../../theme';

/** Student home uses only the student DTO: progress is activity, never mastery. */
export function StudentHomePage() {
  const { user } = useSession();
  const [state, setState] = useState<LessonState | null>(null);
  const [courses, setCourses] = useState<CourseInfo[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [courseError, setCourseError] = useState('');
  // Popup shown when a student tries to enroll in a course an admin hasn't
  // assigned to them (backend returns 403 with a specific message).
  const [notAssigned, setNotAssigned] = useState<string | null>(null);
  async function openCourse(id: string) {
    setOpening(id); setCourseError('');
    try {
      await api.selectCourse(id);
      window.location.assign('/student/lesson');
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        // Not assigned by the admin — show the contact-admin popup.
        setNotAssigned(e.message || "This course isn't assigned to you yet. Please contact your admin.");
      } else {
        setCourseError('Could not open this course. Please try again.');
      }
      setOpening(null);
    }
  }
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    try { setState(await api.getLessonState()); } catch { setError(true); }
  }, []);
  useEffect(() => { void load(); void api.getCourses().then(setCourses).catch(() => setCourses(null)); }, [load]);

  if (error) return <Container sx={{ py: 5 }}><Alert severity="warning" action={<Button color="inherit" onClick={load}>Try again</Button>}>Your learning home couldn’t load. Please try again.</Alert></Container>;
  if (!state) return <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: 300 }}><CircularProgress aria-label="Loading your learning home" /></Box>;

  const name = user?.displayName.split(/\s/)[0] ?? 'there';
  const active = state.phase === 'level';
  const complete = state.phase === 'complete';
  const path = state.phase === 'level' || state.phase === 'choose-depth' ? state.path : [];
  const steps = 'stepsCompleted' in state ? state.stepsCompleted : 0;
  const action = state.phase === 'topic' ? 'Choose a topic' : state.phase === 'diagnostic' ? 'Start my warm-up' : state.phase === 'choose-depth' ? 'Choose what’s next' : complete ? 'View summary' : 'Continue learning';
  const currentTitle = active ? state.level.title : state.phase === 'topic' ? 'Choose a project topic' : state.phase === 'diagnostic' ? 'Course warm-up' : state.phase === 'choose-depth' ? 'Choose your next activity' : 'Course complete';
  const description = active ? state.level.intro : state.phase === 'topic' ? 'Pick an interest to bring into your lesson and final project.' : state.phase === 'diagnostic' ? 'A few questions help us choose a useful place to begin. Take your time; this isn’t graded.' : state.phase === 'choose-depth' ? 'Explore another idea or bring your learning together in a project.' : state.message;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 4 }}>
        <Box>
          <Typography variant="overline" color="primary">MY DASHBOARD</Typography>
          <Typography variant="h1" sx={{ mt: 0.5, fontSize: { xs: '2rem', md: '2.7rem' } }}>{`${name}’s dashboard`}</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>Continue your assigned course or browse the course catalog.</Typography>
        </Box>
      </Box>

      <Box component="nav" aria-label="Learning navigation" sx={{ display: 'flex', gap: 3, borderBottom: `1px solid ${brand.border}`, mb: 3, pb: 1 }}><Typography fontWeight={700}>Home</Typography><Box component="a" href="#courses" sx={{ color: 'primary.main', fontWeight: 700 }}>Courses</Box><Box component={RouterLink} to="/student/profile" sx={{ color: 'primary.main', fontWeight: 700, textDecoration: 'none' }}>Profile</Box></Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.7fr) minmax(0, 1fr)' }, gap: 3 }}>
        <Box sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ bgcolor: '#f1f1f1', px: { xs: 3, md: 4 }, py: 2.5, color: '#292f36', position: 'relative' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}><Typography variant="overline" sx={{ color: '#555' }}>CURRENT COURSE</Typography></Box>
            <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '1.8rem' }, maxWidth: 480 }}>{state.unit?.name ?? 'Create with code & AI'}</Typography>
            <Typography sx={{ mt: 1.5, color: '#555', maxWidth: 460 }}>{state.unit?.summary ?? 'Practice turning ideas into clear instructions, exploring AI output, and making thoughtful improvements.'}</Typography>
            <Chip size="small" label={complete ? 'Lesson complete' : active ? 'In progress' : 'Ready when you are'} sx={{ mt: 2, bgcolor: '#e5f4f6', color: '#006875' }} />
          </Box>
          <Box sx={{ p: { xs: 3, md: 4 } }}>
            <Typography variant="overline" color="text.secondary">{complete ? 'WELL DONE' : 'NEXT ACTIVITY'}</Typography>
            <Typography variant="h2" sx={{ mt: 1, mb: 1 }}>{currentTitle}</Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>{description}</Typography>
            <Button component={RouterLink} to="/student/lesson" variant="contained" size="large" endIcon={<ArrowForwardRoundedIcon />}>{action}</Button>
            {steps > 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{steps} {steps === 1 ? 'step' : 'steps'} completed. Keep going from here.</Typography>}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box component="section" aria-label="Your learning path" sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 3, p: 3 }}>
            <Typography variant="h2" sx={{ mb: 0.5 }}>Course progress</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Your completed lessons and upcoming work. The route adapts as you learn.</Typography>
            <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none' }}>
              {path.length ? path.map((item, index) => (
                <Box component="li" key={item.levelId} aria-current={item.status === 'current' ? 'step' : undefined} sx={{ display: 'flex', gap: 1.5, pb: index === path.length - 1 ? 0 : 2.5 }}>
                  <Box sx={{ width: 28, height: 28, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: item.status === 'current' ? brand.tealDark : item.status === 'done' ? brand.tealLight : brand.bg, color: item.status === 'current' ? '#fff' : 'primary.main', border: `1px solid ${brand.borderLight}`, fontSize: 12, fontWeight: 700 }}>{item.status === 'done' ? <CheckRoundedIcon fontSize="small" /> : index + 1}</Box>
                  <Box><Typography variant="body2" sx={{ fontWeight: item.status === 'current' ? 700 : 500 }}>{item.title}</Typography><Typography variant="caption" color={item.status === 'current' ? 'primary' : 'text.secondary'}>{item.status === 'done' ? 'Completed' : item.status === 'current' ? 'You’re here' : 'Coming up'}</Typography></Box>
                </Box>
              )) : (complete ? ['Lesson complete'] : state.phase === 'topic' ? ['Choose a topic', 'Find your starting point', 'Practice, explore & build'] : ['Find your starting point', 'Practice & explore', 'Create your project']).map((title, i) => <Box component="li" key={title} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2 }}><Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: brand.tealLight, color: 'primary.main', display: 'grid', placeItems: 'center', fontSize: 12 }}>{complete ? <CheckRoundedIcon fontSize="small" /> : i + 1}</Box><Typography variant="body2" fontWeight={500}>{title}</Typography></Box>)}
            </Box>
          </Box>

        </Box>
      </Box>
      <Box component="section" id="courses" sx={{ mt: 5, scrollMarginTop: 90 }}>
        <Typography variant="h2" sx={{ mb: 1 }}>Courses</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>Your assigned course appears first. Open a course to start or continue your saved work.</Typography>
        {courseError && <Alert severity="warning" sx={{ mb: 2 }}>{courseError}</Alert>}
        {courses === null ? <Alert severity="info">Course list is unavailable right now. Your assigned course is shown above.</Alert> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2 }}>{[...courses].sort((a, b) => Number(b.assigned) - Number(a.assigned)).map((course) => <Box key={course.id} sx={{ bgcolor: '#fff', border: `1px solid ${brand.border}`, borderTop: `5px solid ${course.assigned ? brand.tealDark : brand.purple}`, p: 2.5, display: 'flex', flexDirection: 'column', gap: 1 }}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Typography variant="h3" sx={{ flex: 1 }}>{course.name}</Typography>{course.assigned ? <Chip size="small" label="Assigned" sx={{ bgcolor: brand.tealLight, color: '#006875' }} /> : <Chip size="small" variant="outlined" icon={<LockOutlinedIcon />} label="Not assigned" />}</Box><Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{course.summary}</Typography><Button disabled={opening !== null} onClick={() => void openCourse(course.id)} variant={course.assigned ? 'contained' : 'outlined'} sx={{ alignSelf: 'flex-start', mt: 1 }}>{opening === course.id ? 'Opening…' : 'Open course'}</Button></Box>)}</Box>}
      </Box>

      <Dialog open={notAssigned !== null} onClose={() => setNotAssigned(null)} aria-labelledby="not-assigned-title">
        <DialogTitle id="not-assigned-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LockOutlinedIcon color="action" /> Course not assigned
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {notAssigned} You can still browse this course here, but your admin needs to assign it before you can
            open it.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNotAssigned(null)} variant="contained">
            Got it
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
