import { Box, Tooltip, Typography } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import type { PathItem } from '../../api';
import { brand, headingFont } from '../../theme';

/**
 * Lesson progress as a single continuous bar in the top bar.
 *
 * Why a bar and not numbered steps: the adaptive engine (and teacher
 * assignments) can add or re-order steps as the student works. Numbered bubbles
 * would visibly renumber and reveal the plan changing. A proportional fill just
 * re-eases to a new position, so the student perceives steady momentum, never an
 * explicit "step N of M" that shifts under them (FR13: no performance/plan cues).
 *
 * The fill is `done / total` of the known path. The width is CSS-transitioned,
 * so when `total` changes the bar animates to its new proportion rather than
 * jumping or renumbering.
 */
export function ProgressBar({ path, lessonName }: { path: PathItem[]; lessonName: string }) {
  const total = Math.max(path.length, 1);
  const doneCount = path.filter((p) => p.status === 'done').length;
  const current = path.find((p) => p.status === 'current');
  const atProject = current?.levelId.startsWith('p') ?? false;

  // Fill through the end of the done steps, plus a little into the current step
  // so the bar always shows the learner is mid-stride (never 0% while working).
  const fill = Math.min(100, Math.round(((doneCount + 0.5) / total) * 100));

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0, width: '100%', maxWidth: 560 }}>
      <Typography
        sx={{
          fontFamily: headingFont,
          fontWeight: 600,
          fontSize: '1.05rem',
          color: '#fff',
          whiteSpace: 'nowrap',
          display: { xs: 'none', lg: 'block' },
        }}
      >
        {lessonName}
      </Typography>

      <Tooltip title={current ? `You're working on: ${current.title}` : 'Your progress so far'}>
        <Box
          role="progressbar"
          aria-label="Lesson progress"
          aria-valuetext={current ? `Working on ${current.title}` : 'In progress'}
          sx={{ flex: 1, minWidth: 120, display: 'flex', alignItems: 'center', gap: 1.25 }}
        >
          <Box
            sx={{
              position: 'relative',
              flex: 1,
              height: 10,
              borderRadius: 999,
              bgcolor: 'rgba(255,255,255,0.22)',
              overflow: 'hidden',
            }}
          >
            {/* Filled portion — width transitions whenever done/total changes. */}
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                width: `${fill}%`,
                borderRadius: 999,
                background: `linear-gradient(90deg, ${brand.teal}, ${brand.tealLight})`,
                transition: 'width 600ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
            {/* Leading marker: the student's current position on the bar. */}
            <Box
              aria-hidden
              sx={{
                position: 'absolute',
                top: '50%',
                left: `${fill}%`,
                transform: 'translate(-50%, -50%)',
                width: 16,
                height: 16,
                borderRadius: '50%',
                bgcolor: '#fff',
                border: `3px solid ${brand.orange}`,
                boxShadow: '0 0 0 3px rgba(255,164,0,0.25)',
                transition: 'left 600ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </Box>
          {/* Goal marker: the project/finish. No counts — just a destination. */}
          <StarIcon
            sx={{ fontSize: 20, color: atProject ? brand.orange : 'rgba(255,255,255,0.65)', flexShrink: 0 }}
            aria-hidden
          />
        </Box>
      </Tooltip>
    </Box>
  );
}
