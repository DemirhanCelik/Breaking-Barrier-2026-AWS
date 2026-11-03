import { Box, Chip, Tooltip, Typography } from '@mui/material';
import type { AttainmentStatus, Stage, TeacherConcept } from '../../api';

const STAGE_NAMES: Record<Stage, string> = { 0: 'Missing', 1: 'Beginning', 2: 'Meeting', 3: 'Exceeding' };

export function StageCell({
  stage,
  placed,
  bar,
  concept,
}: {
  stage: Stage;
  placed: Stage | null;
  bar: Stage;
  concept: TeacherConcept;
}) {
  const atBar = stage >= bar;
  return (
    <Tooltip title={`${concept.name}, Stage ${stage} (${STAGE_NAMES[stage]}): ${concept.descriptors[stage]}`}>
      <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.25 }}>
        <Chip
          size="small"
          label={`${stage} · ${STAGE_NAMES[stage]}`}
          color={stage === 3 ? 'secondary' : atBar ? 'success' : 'warning'}
          variant={atBar ? 'filled' : 'outlined'}
        />
        {placed !== null && (
          <Typography variant="caption" color="text.secondary">
            placed at {placed}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
}

const STATUS: Record<AttainmentStatus, { label: string; color: 'default' | 'success' | 'warning' | 'error' | 'info' | 'secondary' }> = {
  'not-started': { label: 'Not started', color: 'default' },
  'on-track': { label: 'On track', color: 'info' },
  'needs-attention': { label: 'Needs attention', color: 'warning' },
  fallback: { label: 'Non-adaptive path', color: 'error' },
  'met-bar': { label: 'Met bar', color: 'success' },
  complete: { label: 'Complete', color: 'secondary' },
};

export function StatusChip({ status }: { status: AttainmentStatus }) {
  const s = STATUS[status];
  return <Chip size="small" label={s.label} color={s.color} />;
}
