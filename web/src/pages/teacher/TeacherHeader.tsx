import type { ReactNode } from 'react';
import { Box, Container, Typography } from '@mui/material';
import { brand } from '../../theme';

/** Purple band used on teacher pages (teacher surfaces are visually distinct from the student lesson). */
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
    <Box sx={{ bgcolor: brand.purple, color: '#fff' }}>
      <Container maxWidth="xl" sx={{ pt: 3.5, pb: 3.5 }}>
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
    </Box>
  );
}

export function HeaderStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box sx={{ px: 2.5, py: 1.25, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.12)', minWidth: 120 }}>
      <Typography sx={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1.1 }}>{value}</Typography>
      <Typography variant="body2" sx={{ opacity: 0.85 }}>
        {label}
      </Typography>
    </Box>
  );
}
