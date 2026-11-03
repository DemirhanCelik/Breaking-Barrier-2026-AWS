import { Paper, Stack, Typography } from '@mui/material';
import CelebrationOutlinedIcon from '@mui/icons-material/CelebrationOutlined';
import type { LessonState } from '../../api';

export function CompleteView({ state }: { state: Extract<LessonState, { phase: 'complete' }> }) {
  return (
    <Paper sx={{ p: 5, maxWidth: 640, mx: 'auto', textAlign: 'center' }}>
      <Stack spacing={2} alignItems="center">
        <CelebrationOutlinedIcon color="secondary" sx={{ fontSize: 56 }} />
        <Typography variant="h1">Nice work today</Typography>
        <Typography color="text.secondary">{state.message}</Typography>
        <Typography variant="body2" color="text.secondary">
          {state.stepsCompleted} steps done.
        </Typography>
      </Stack>
    </Paper>
  );
}
