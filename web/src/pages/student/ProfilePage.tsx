import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Chip, CircularProgress, Container, LinearProgress, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { api, type StudentCourseProgress, type StudentProfile } from '../../api';
import { brand } from '../../theme';

/** Status label + brand colors for the course status chip. */
const STATUS_META: Record<StudentCourseProgress['status'], { label: string; bg: string; color: string }> = {
  'not-started': { label: 'Not started', bg: brand.strip, color: brand.gray },
  'in-progress': { label: 'In progress', bg: brand.tealLight, color: '#006875' },
  complete: { label: 'Complete', bg: brand.purpleLight, color: brand.purpleDark },
};

/** "Mar 3, 2026, 2:15 PM" style; falls back to the raw value if it isn't a date. */
function formatLastActive(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Read-only student profile and progress. It shows every course the student has,
 * with activity-based progress only (never mastery, scores, or stages; FR13).
 */
export function ProfilePage() {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setProfile(await api.getProfile());
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <Container sx={{ py: 5 }}>
        <Alert severity="warning" action={<Button color="inherit" onClick={load}>Try again</Button>}>
          Your profile couldn’t load. Please try again.
        </Alert>
      </Container>
    );
  }
  if (!profile) {
    return (
      <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: 300 }}>
        <CircularProgress aria-label="Loading your profile" />
      </Box>
    );
  }

  const { user, courses } = profile;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="overline" color="primary">MY PROFILE</Typography>
        <Typography variant="h1" sx={{ mt: 0.5, fontSize: { xs: '2rem', md: '2.7rem' } }}>{user.displayName}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, color: 'text.secondary' }}>
          <LockOutlinedIcon fontSize="small" />
          <Typography color="text.secondary">
            Your details are managed by your school and can’t be edited here.
          </Typography>
        </Box>
      </Box>

      <Box component="nav" aria-label="Learning navigation" sx={{ display: 'flex', gap: 3, borderBottom: `1px solid ${brand.border}`, mb: 3, pb: 1 }}>
        <Box component={RouterLink} to="/student" sx={{ color: 'primary.main', fontWeight: 700, textDecoration: 'none' }}>Home</Box>
        <Box component={RouterLink} to="/student#courses" sx={{ color: 'primary.main', fontWeight: 700, textDecoration: 'none' }}>Courses</Box>
        <Typography fontWeight={700}>Profile</Typography>
      </Box>

      <Typography variant="h2" sx={{ mb: 1 }}>Your courses</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Progress reflects the steps you’ve completed. It isn’t a grade.
      </Typography>

      {courses.length === 0 ? (
        <Alert severity="info">You don’t have any courses yet. Your assigned course will appear here once it’s set up.</Alert>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
          {courses.map((course) => {
            const status = STATUS_META[course.status];
            const percent = Math.max(0, Math.min(100, Math.round(course.percent)));
            return (
              <Box
                component="section"
                aria-label={course.name}
                key={course.id}
                sx={{
                  bgcolor: '#fff',
                  border: `1px solid ${brand.border}`,
                  borderTop: `5px solid ${course.current ? brand.tealDark : brand.purple}`,
                  borderRadius: 2,
                  p: 2.5,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="h3" sx={{ flex: 1, minWidth: 0 }}>{course.name}</Typography>
                  {course.current && (
                    <Chip size="small" label="Current" sx={{ bgcolor: brand.tealLight, color: '#006875', fontWeight: 700 }} />
                  )}
                </Box>
                {course.summary && (
                  <Typography variant="body2" color="text.secondary">{course.summary}</Typography>
                )}

                <Box sx={{ mt: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={percent}
                    aria-label={`${percent}% complete`}
                    sx={{ height: 8, borderRadius: 4, bgcolor: brand.strip, '& .MuiLinearProgress-bar': { bgcolor: brand.teal, borderRadius: 4 } }}
                  />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.75 }}>
                    <Typography variant="body2" color="text.secondary">
                      {course.stepsCompleted} of {course.totalSteps} steps
                    </Typography>
                    <Typography variant="body2" color="text.secondary">{percent}%</Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                  <Chip size="small" label={status.label} sx={{ bgcolor: status.bg, color: status.color, fontWeight: 600 }} />
                  {course.lastActiveAt && (
                    <Typography variant="caption" color="text.secondary">
                      Last active {formatLastActive(course.lastActiveAt)}
                    </Typography>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Container>
  );
}
