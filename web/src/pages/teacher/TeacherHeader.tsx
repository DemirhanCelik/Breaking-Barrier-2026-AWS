import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Container, Tab, Tabs, Typography } from '@mui/material';
import { brand } from '../../theme';

/** Shared overview and navigation for teacher pages. */
export function TeacherHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <Box sx={{ bgcolor: '#7665a0', color: '#fff', borderBottom: `1px solid ${brand.borderLight}` }}>
      <Container maxWidth="xl" sx={{ pt: 5, pb: 3 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 3 }}>
          <Box sx={{ flex: 1, minWidth: 260 }}>
            {eyebrow && (
              <Typography variant="overline" sx={{ opacity: 0.85 }}>
                {eyebrow}
              </Typography>
            )}
            <Typography variant="h1" sx={{ fontSize: { xs: '1.9rem', md: '2.4rem' } }}>
              {title}
            </Typography>
            {subtitle && <Typography sx={{ opacity: 0.9, mt: 0.5 }}>{subtitle}</Typography>}
          </Box>
          {right}
        </Box>
      </Container>
      <TeacherTabs />
    </Box>
  );
}

const TABS = [
  { path: '/teacher', label: 'Class' },
  { path: '/teacher/courses', label: 'Courses' },
  { path: '/teacher/insights', label: 'Insights' },
  { path: '/teacher/authoring', label: 'Authoring' },
  { path: '/teacher/evidence', label: 'Launch gates' },
  { path: '/teacher/safety', label: 'Safety log' },
];

/** One navigation bar for every teacher page. */
function TeacherTabs() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current =
    TABS.find((t) => t.path === pathname)?.path ?? (pathname.startsWith('/teacher/students') ? '/teacher' : false);
  return (
    <Container maxWidth="xl">
      <Tabs
        value={current}
        onChange={(_, v: string) => navigate(v)}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Teacher pages"
        textColor="inherit"
        TabIndicatorProps={{ sx: { bgcolor: '#fff', height: 3 } }}
        sx={{
          minHeight: 44,
          '& .MuiTab-root': {
            minHeight: 44,
            color: 'rgba(255,255,255,0.8)',
            fontWeight: 700,
            textTransform: 'none',
            fontSize: 15,
          },
          '& .Mui-selected': { color: '#fff' },
        }}
      >
        {TABS.map((t) => (
          <Tab key={t.path} value={t.path} label={t.label} />
        ))}
      </Tabs>
    </Container>
  );
}

export function HeaderStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box sx={{ px: 2.5, py: 1.25, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', minWidth: 120 }}>
      <Typography sx={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1.1 }}>{value}</Typography>
      <Typography variant="body2" sx={{ opacity: 0.85 }}>
        {label}
      </Typography>
    </Box>
  );
}
