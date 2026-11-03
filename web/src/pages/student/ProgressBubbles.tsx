import { Box, Tooltip, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import StarIcon from '@mui/icons-material/Star';
import type { PathItem } from '../../api';
import { brand, headingFont } from '../../theme';

/**
 * Lesson progress bubbles in the top bar. Bubbles show only done / current /
 * coming up. They never encode performance or difficulty (FR13).
 */
export function ProgressBubbles({ path, lessonName }: { path: PathItem[]; lessonName: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
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
      <Box
        component="ol"
        aria-label="Lesson progress"
        sx={{ display: 'flex', alignItems: 'center', listStyle: 'none', m: 0, p: 0, overflowX: 'auto', py: 0.5 }}
      >
        {path.map((p, i) => {
          const isProject = p.levelId.startsWith('p');
          const done = p.status === 'done';
          const current = p.status === 'current';
          const size = current ? 32 : 26;
          return (
            <Box component="li" key={p.levelId} sx={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && (
                <Box sx={{ width: 10, height: 3, bgcolor: done || current ? brand.teal : 'rgba(255,255,255,0.25)' }} />
              )}
              <Tooltip title={`${p.title}${done ? ' (done)' : current ? ' (you are here)' : ''}`}>
                <Box
                  aria-current={current ? 'step' : undefined}
                  aria-label={`Step ${i + 1}: ${p.title}${done ? ', done' : current ? ', current step' : ''}`}
                  sx={{
                    width: size,
                    height: size,
                    borderRadius: isProject ? 1.5 : '50%',
                    transform: isProject ? 'rotate(45deg) scale(0.86)' : undefined,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 13,
                    fontWeight: 800,
                    flexShrink: 0,
                    bgcolor: done ? brand.teal : current ? '#fff' : 'transparent',
                    color: done ? '#fff' : current ? brand.charcoal : 'rgba(255,255,255,0.7)',
                    border: current
                      ? `3px solid ${brand.orange}`
                      : done
                        ? `2px solid ${brand.teal}`
                        : '2px solid rgba(255,255,255,0.4)',
                    boxShadow: current ? `0 0 0 3px rgba(255,164,0,0.25)` : undefined,
                  }}
                >
                  <Box sx={{ transform: isProject ? 'rotate(-45deg)' : undefined, display: 'grid', placeItems: 'center' }}>
                    {isProject ? (
                      <StarIcon sx={{ fontSize: 15 }} />
                    ) : done ? (
                      <CheckIcon sx={{ fontSize: 16 }} />
                    ) : (
                      i + 1
                    )}
                  </Box>
                </Box>
              </Tooltip>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
