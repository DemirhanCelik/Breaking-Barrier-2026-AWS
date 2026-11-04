import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Chip, CircularProgress, Container, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined';
import { api, type LessonState } from '../../api';
import { Bit } from '../../components/brand';
import { useSession } from '../../session';
import { brand } from '../../theme';

/** Student home uses only the student DTO: progress is activity, never mastery. */
export function StudentHomePage() {
  const { user } = useSession();
  const [state, setState] = useState<LessonState | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    try { setState(await api.getLessonState()); } catch { setError(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (error) return <Container sx={{ py: 5 }}><Alert severity="warning" action={<Button color="inherit" onClick={load}>Try again</Button>}>Your learning home couldn’t load. Please try again.</Alert></Container>;
  if (!state) return <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: 300 }}><CircularProgress aria-label="Loading your learning home" /></Box>;

  const name = user?.displayName.split(/\s/)[0] ?? 'there';
  const active = state.phase === 'level';
  const complete = state.phase === 'complete';
  const path = state.phase === 'level' || state.phase === 'choose-depth' ? state.path : [];
  const steps = 'stepsCompleted' in state ? state.stepsCompleted : 0;
  const action = state.phase === 'topic' ? 'Make it yours' : state.phase === 'diagnostic' ? 'Start my warm-up' : state.phase === 'choose-depth' ? 'Choose what’s next' : complete ? 'View my wrap-up' : 'Continue learning';
  const currentTitle = active ? state.level.title : state.phase === 'topic' ? 'Start with something you care about' : state.phase === 'diagnostic' ? 'Let’s find your starting point' : state.phase === 'choose-depth' ? 'Ready to make it your own?' : 'Look at what you’ve accomplished';
  const description = active ? state.level.intro : state.phase === 'topic' ? 'Pick an interest to bring into your lesson and final project.' : state.phase === 'diagnostic' ? 'A few questions help us choose a useful place to begin. Take your time; this isn’t graded.' : state.phase === 'choose-depth' ? 'Explore another idea or bring your learning together in a project.' : state.message;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 4 }}>
        <Box>
          <Typography variant="overline" color="primary">MY LEARNING</Typography>
          <Typography variant="h1" sx={{ mt: 0.5, fontSize: { xs: '2rem', md: '2.7rem' } }}>{steps ? `Welcome back, ${name}.` : `Let’s make something, ${name}.`}</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>Your ideas. Your pace. A little support along the way.</Typography>
        </Box>
        <Box sx={{ display: { xs: 'none', sm: 'block' }, p: 2, bgcolor: brand.tealLight, borderRadius: 4 }}><Bit size={64} /></Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.7fr) minmax(0, 1fr)' }, gap: 3 }}>
        <Box sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ bgcolor: '#203c36', px: { xs: 3, md: 4 }, py: 4, color: '#fff', position: 'relative' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}><CodeRoundedIcon sx={{ color: '#a3e0bd' }} /><Typography variant="overline" sx={{ color: '#b6dace' }}>YOUR LEARNING STUDIO</Typography></Box>
            <Typography variant="h2" sx={{ fontSize: { xs: '1.8rem', md: '2.3rem' }, maxWidth: 480 }}>{state.unit?.name ?? 'Create with code & AI'}</Typography>
            <Typography sx={{ mt: 1.5, color: '#cbddd5', maxWidth: 460 }}>{state.unit?.summary ?? 'Practice turning ideas into clear instructions, exploring AI output, and making thoughtful improvements.'}</Typography>
            <Chip size="small" label={complete ? 'Lesson complete' : active ? 'In progress' : 'Ready when you are'} sx={{ mt: 3, bgcolor: '#36574b', color: '#d9f4df', border: '1px solid #557b64' }} />
          </Box>
          <Box sx={{ p: { xs: 3, md: 4 } }}>
            <Typography variant="overline" color="text.secondary">{complete ? 'WELL DONE' : 'YOUR NEXT STEP'}</Typography>
            <Typography variant="h2" sx={{ mt: 1, mb: 1 }}>{currentTitle}</Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>{description}</Typography>
            <Button component={RouterLink} to="/student/lesson" variant="contained" size="large" endIcon={<ArrowForwardRoundedIcon />}>{action}</Button>
            {steps > 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{steps} {steps === 1 ? 'step' : 'steps'} completed. Keep going from here.</Typography>}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box component="section" aria-label="Your learning path" sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 3, p: 3 }}>
            <Typography variant="h2" sx={{ mb: 0.5 }}>Your path</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>One step at a time. Your next steps can change as you learn.</Typography>
            <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none' }}>
              {path.length ? path.map((item, index) => (
                <Box component="li" key={item.levelId} aria-current={item.status === 'current' ? 'step' : undefined} sx={{ display: 'flex', gap: 1.5, pb: index === path.length - 1 ? 0 : 2.5 }}>
                  <Box sx={{ width: 28, height: 28, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: item.status === 'current' ? brand.tealDark : item.status === 'done' ? brand.tealLight : brand.bg, color: item.status === 'current' ? '#fff' : 'primary.main', border: `1px solid ${brand.borderLight}`, fontSize: 12, fontWeight: 700 }}>{item.status === 'done' ? <CheckRoundedIcon fontSize="small" /> : index + 1}</Box>
                  <Box><Typography variant="body2" sx={{ fontWeight: item.status === 'current' ? 700 : 500 }}>{item.title}</Typography><Typography variant="caption" color={item.status === 'current' ? 'primary' : 'text.secondary'}>{item.status === 'done' ? 'Completed' : item.status === 'current' ? 'You’re here' : 'Coming up'}</Typography></Box>
                </Box>
              )) : (complete ? ['Lesson complete'] : state.phase === 'topic' ? ['Make it yours', 'Find your starting point', 'Practice, explore & build'] : ['Find your starting point', 'Practice & explore', 'Create your project']).map((title, i) => <Box component="li" key={title} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2 }}><Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: brand.tealLight, color: 'primary.main', display: 'grid', placeItems: 'center', fontSize: 12 }}>{complete ? <CheckRoundedIcon fontSize="small" /> : i + 1}</Box><Typography variant="body2" fontWeight={500}>{title}</Typography></Box>)}
            </Box>
          </Box>
          <Box sx={{ p: 3, bgcolor: '#eaf0e6', borderRadius: 3, display: 'flex', gap: 1.5 }}><ExploreOutlinedIcon color="primary" /><Box><Typography fontWeight={700}>You don’t have to know it all.</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Inside your lesson, ask Bit for a hint or try extra practice. Making changes is part of learning.</Typography></Box></Box>
        </Box>
      </Box>
    </Container>
  );
}
