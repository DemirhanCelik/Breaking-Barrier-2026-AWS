import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Container, Tab, Tabs, Typography } from '@mui/material';
import { brand } from '../../theme';

/** Shared overview and navigation for admin pages. Mirrors TeacherHeader. */
export function AdminHeader({
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
    <Box sx={{ bgcolor: '#263d39', color: '#fff', borderBottom: `1px solid ${brand.borderLight}` }}>
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
      <AdminTabs />
    </Box>
  );
}

const TABS = [
  { path: '/admin/appointments', label: 'Appointments' },
  { path: '/admin/review', label: 'Review queue' },
  { path: '/admin/curriculum', label: 'Curriculum' },
];

/** One navigation bar for every admin page. No class, insights, or student tabs. */
function AdminTabs() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = TABS.find((t) => t.path === pathname)?.path ?? (pathname === '/admin' ? false : false);
  return (
    <Container maxWidth="xl">
      <Tabs
        value={current}
        onChange={(_, v: string) => navigate(v)}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Admin pages"
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
