import { useState } from 'react';
import { Box, Container, Typography } from '@mui/material';
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined';
import BuildCircleOutlinedIcon from '@mui/icons-material/BuildCircleOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { api, type DepthOption, type LessonState } from '../../api';
import { SpeechBubble } from '../../components/brand';
import { brand } from '../../theme';

/**
 * Shown once every required concept is at the bar. Optional depth is offered as
 * a choice of what to explore, not as a harder tier (FR6, Tenet 4).
 */
export function DepthChoiceView({ options, onChosen }: { options: DepthOption[]; onChosen: (s: LessonState) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      onChosen(await api.chooseDepth(id));
    } catch {
      setError("We couldn't open that just now. Please try again.");
      setBusy(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Pick what's next
      </Typography>
      <SpeechBubble sx={{ mb: 4 }}>
        <Typography>
          You've covered everything for today's page. Choose a challenge to explore, or go straight to building your own
          project. You'll build it either way.
        </Typography>
      </SpeechBubble>
      {error && (
        <Typography color="error" sx={{ mb: 2 }} role="alert">
          {error}
        </Typography>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        {options.map((o) => {
          const isProject = o.id === 'project';
          const Icon = isProject ? BuildCircleOutlinedIcon : ExploreOutlinedIcon;
          return (
            <Box
              key={o.id}
              component="button"
              type="button"
              disabled={busy}
              onClick={() => choose(o.id)}
              sx={{
                all: 'unset',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                p: 2.5,
                borderRadius: 2,
                bgcolor: '#fff',
                border: `2px solid ${brand.borderLight}`,
                borderTop: `6px solid ${isProject ? brand.orange : brand.purple}`,
                '&:hover': { borderColor: isProject ? brand.orange : brand.purple },
                '&:focus-visible': { outline: `3px solid ${brand.orange}`, outlineOffset: 2 },
              }}
            >
              <Icon sx={{ fontSize: 34, color: isProject ? brand.orangeDark : brand.purple }} />
              <Typography variant="h3">{o.label}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                {o.description}
              </Typography>
              <Typography
                sx={{ fontWeight: 700, color: brand.tealDark, display: 'flex', alignItems: 'center', gap: 0.5 }}
              >
                {isProject ? 'Start building' : 'Explore this'} <ArrowForwardIcon fontSize="small" />
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Container>
  );
}
