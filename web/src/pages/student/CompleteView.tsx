import { Box, Button, Container, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import type { LessonState } from '../../api';
import { Bit } from '../../components/brand';
import { brand } from '../../theme';

const CONFETTI = [
  { c: brand.teal, x: 8, y: 18, r: 12 },
  { c: brand.orange, x: 22, y: 8, r: -20 },
  { c: brand.purple, x: 78, y: 12, r: 30 },
  { c: brand.teal, x: 90, y: 30, r: -8 },
  { c: brand.orange, x: 70, y: 70, r: 45 },
  { c: brand.purple, x: 14, y: 72, r: -35 },
  { c: '#3d9b5f', x: 50, y: 4, r: 10 },
  { c: '#d65a7a', x: 36, y: 86, r: 25 },
];

export function CompleteView({ state }: { state: Extract<LessonState, { phase: 'complete' }> }) {
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 5, md: 8 } }}>
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          bgcolor: '#fff',
          borderRadius: 3,
          border: `1px solid ${brand.borderLight}`,
          textAlign: 'center',
          px: 4,
          py: 6,
        }}
      >
        {CONFETTI.map((p, i) => (
          <Box
            key={i}
            aria-hidden
            sx={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: 14,
              height: 6,
              borderRadius: 1,
              bgcolor: p.c,
              transform: `rotate(${p.r}deg)`,
              opacity: 0.85,
            }}
          />
        ))}
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Bit size={96} />
        </Box>
        <Typography variant="h1" sx={{ mb: 1.5 }}>
          You did it!
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 380, mx: 'auto' }}>
          {state.message}
        </Typography>
        <Typography variant="overline" sx={{ color: brand.tealDark }}>
          {state.stepsCompleted} steps done
        </Typography>
        <Box sx={{ mt: 3 }}><Button component={RouterLink} to="/student" variant="contained" startIcon={<ArrowBackRoundedIcon />}>Back to my learning</Button></Box>
      </Box>
    </Container>
  );
}
