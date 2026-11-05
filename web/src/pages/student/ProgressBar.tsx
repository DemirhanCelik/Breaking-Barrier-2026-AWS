import { useEffect, useRef, useState } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import type { PathItem } from '../../api';
import { brand, headingFont } from '../../theme';

/**
 * Lesson progress in the top bar: a fill bar plus "Step N of M".
 *
 * The adaptive engine (and teacher assignments) can add steps as the student
 * works. The count makes that visible: when the path grows, a short "+N steps"
 * note appears next to the count. It is the student's own path only, never a
 * comparison with anyone else.
 */
export function ProgressBar({ path, lessonName }: { path: PathItem[]; lessonName: string }) {
  const total = Math.max(path.length, 1);
  const doneCount = path.filter((p) => p.status === 'done').length;
  const current = path.find((p) => p.status === 'current');
  const atProject = current?.levelId.startsWith('p') ?? false;

  // Fill through the end of the done steps, plus a little into the current step
  // so the bar always shows the learner is mid-stride (never 0% while working).
  const fill = Math.min(100, Math.round(((doneCount + 0.5) / total) * 100));
  const stepNow = Math.min(total, doneCount + (current ? 1 : 0)) || 1;

  // Briefly show "+N steps" when the path grows (e.g. extra practice after a miss).
  const prevTotal = useRef(path.length);
  const [added, setAdded] = useState(0);
  useEffect(() => {
    const grew = path.length - prevTotal.current;
    prevTotal.current = path.length;
    if (grew > 0) {
      setAdded(grew);
      const t = window.setTimeout(() => setAdded(0), 6000);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [path.length]);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0, width: '100%', maxWidth: 820 }}>
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
          aria-valuetext={`Step ${stepNow} of ${total}${current ? `: ${current.title}` : ''}`}
          sx={{ flex: 1, minWidth: { xs: 0, sm: 120 }, display: 'flex', alignItems: 'center', gap: { xs: 0.75, sm: 1.25 } }}
        >
          <Box
            sx={{
              position: 'relative',
              flex: 1,
              minWidth: { xs: 40, sm: 140 },
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
            sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 20, color: atProject ? brand.orange : 'rgba(255,255,255,0.65)', flexShrink: 0 }}
            aria-hidden
          />
          <Typography
            sx={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Step {stepNow} of {total}</Box>
            <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>{stepNow}/{total}</Box>
          </Typography>
          {added > 0 && (
            <Box
              role="status"
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: 999,
                bgcolor: brand.orange,
                color: '#1c1c1c',
                fontWeight: 800,
                fontSize: '0.8rem',
                whiteSpace: 'nowrap',
              }}
            >
              +{added}
              <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
                {' '}step{added === 1 ? '' : 's'} to help you practice
              </Box>
            </Box>
          )}
        </Box>
      </Tooltip>
    </Box>
  );
}
