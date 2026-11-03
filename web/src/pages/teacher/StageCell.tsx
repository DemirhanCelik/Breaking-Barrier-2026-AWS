import { Box, Tooltip, Typography } from '@mui/material';
import type { AttainmentStatus, Stage, TeacherConcept } from '../../api';
import { brand } from '../../theme';

export const STAGE_NAMES: Record<Stage, string> = { 0: 'Missing', 1: 'Beginning', 2: 'Meeting', 3: 'Exceeding' };

export const STAGE_STYLE: Record<Stage, { bg: string; fg: string; border: string }> = {
  0: { bg: '#fff', fg: brand.gray, border: brand.border },
  1: { bg: brand.tealLight, fg: brand.charcoal, border: '#9fdde3' },
  2: { bg: brand.teal, fg: brand.charcoal, border: brand.teal },
  3: { bg: brand.purple, fg: '#fff', border: brand.purple },
};

export function StageSquare({ stage, size = 34, belowBar }: { stage: Stage; size?: number; belowBar?: boolean }) {
  const s = STAGE_STYLE[stage];
  return (
    <Box
      sx={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: 1,
        bgcolor: s.bg,
        color: s.fg,
        border: `2px solid ${s.border}`,
        display: 'grid',
        placeItems: 'center',
        fontWeight: 800,
        fontSize: size * 0.42,
        flexShrink: 0,
      }}
    >
      {stage}
      {belowBar && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            top: -5,
            right: -5,
            width: 10,
            height: 10,
            borderRadius: '50%',
            bgcolor: brand.orange,
            border: '2px solid #fff',
          }}
        />
      )}
    </Box>
  );
}

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
  const grew = placed !== null && stage > placed;
  return (
    <Tooltip
      title={
        <>
          <strong>
            {concept.name}: Stage {stage} ({STAGE_NAMES[stage]})
          </strong>
          <br />
          {concept.descriptors[stage]}
          {placed !== null && (
            <>
              <br />
              Warm-up placed at Stage {placed}.
            </>
          )}
        </>
      }
    >
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
        <StageSquare stage={stage} belowBar={stage < bar} />
        {grew && (
          <Typography variant="caption" sx={{ color: brand.tealDark, fontWeight: 700, whiteSpace: 'nowrap' }}>
            ↑ from {placed}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
}

export function StageLegend({ bar }: { bar: Stage }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2.5 }}>
      {([0, 1, 2, 3] as Stage[]).map((s) => (
        <Box key={s} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <StageSquare stage={s} size={24} />
          <Typography variant="body2" sx={{ fontWeight: s === bar ? 700 : 500 }}>
            {STAGE_NAMES[s]}
            {s === bar ? ' (the bar)' : s === 3 ? ' (optional)' : ''}
          </Typography>
        </Box>
      ))}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: brand.orange }} />
        <Typography variant="body2">Below the bar</Typography>
      </Box>
    </Box>
  );
}

const STATUS: Record<AttainmentStatus, { label: string; color: string }> = {
  'not-started': { label: 'Not started', color: brand.border },
  'on-track': { label: 'Working', color: brand.teal },
  'needs-attention': { label: 'Needs attention', color: brand.orange },
  fallback: { label: 'Non-adaptive path', color: '#d0453f' },
  'met-bar': { label: 'Met the bar', color: '#3d9b5f' },
  complete: { label: 'Finished', color: brand.purple },
};

export function StatusChip({ status }: { status: AttainmentStatus }) {
  const s = STATUS[status];
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, whiteSpace: 'nowrap' }}>
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s.color, flexShrink: 0 }} />
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {s.label}
      </Typography>
    </Box>
  );
}
