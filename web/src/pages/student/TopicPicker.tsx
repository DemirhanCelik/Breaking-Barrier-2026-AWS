import { useState } from 'react';
import { Alert, Box, ButtonBase, Container, Typography } from '@mui/material';
import { api, type LessonState } from '../../api';
import { SpeechBubble } from '../../components/brand';
import { brand } from '../../theme';

const ICONS: Record<string, string> = {
  'school life': '🏫',
  sports: '🏀',
  music: '🎵',
  gaming: '🎮',
  'the environment': '🌱',
  food: '🍜',
  'art and design': '🎨',
  art: '🎨',
  'space and science': '🚀',
  science: '🔬',
  robotics: '🤖',
  esports: '🕹️',
};

/** First step: the student picks what their project is about. Every step uses it. */
export function TopicPicker({
  topics,
  unitName,
  onChosen,
}: {
  topics: string[];
  unitName?: string;
  onChosen: (s: LessonState) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (topic: string) => {
    setBusy(topic);
    setError(null);
    try {
      onChosen(await api.chooseTopic(topic));
    } catch {
      setError("Couldn't save that. Please try again.");
      setBusy(null);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, md: 6 } }}>
      {unitName && (
        <Typography variant="overline" color="text.secondary">
          {unitName}
        </Typography>
      )}
      <Typography variant="h1" sx={{ fontSize: { xs: '1.8rem', md: '2.3rem' }, mb: 2 }}>
        What do you want to make it about?
      </Typography>
      <SpeechBubble mood="happy" sx={{ mb: 3 }}>
        <Typography>
          Pick a topic you care about. Every step in this lesson will use it, and you can make your final project about
          it.
        </Typography>
      </SpeechBubble>
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
        {topics.map((t) => (
          <ButtonBase
            key={t}
            onClick={() => void choose(t)}
            disabled={busy !== null}
            sx={{
              flexDirection: 'column',
              gap: 1,
              py: 2.5,
              borderRadius: 2,
              border: `2px solid ${busy === t ? brand.purple : brand.border}`,
              bgcolor: '#fff',
              '&:hover': { borderColor: brand.purple },
              '&:focus-visible': { outline: `3px solid ${brand.purple}` },
            }}
          >
            <Box sx={{ fontSize: 34 }} aria-hidden>
              {ICONS[t] ?? '✨'}
            </Box>
            <Typography sx={{ fontWeight: 700, textTransform: 'capitalize' }}>{t}</Typography>
          </ButtonBase>
        ))}
      </Box>
    </Container>
  );
}
