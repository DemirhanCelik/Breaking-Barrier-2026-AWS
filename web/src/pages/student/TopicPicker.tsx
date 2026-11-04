import { useState } from 'react';
import { Alert, Box, Button, ButtonBase, Container, Typography } from '@mui/material';
import { api, type LessonState } from '../../api';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
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
  const [selected, setSelected] = useState<string | null>(null);
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
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 4, color: 'text.secondary', flexWrap: 'wrap' }}>
        {['Make it yours', 'Warm up', 'Start creating'].map((label, i) => <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2 }}><Box sx={{ width: 25, height: 25, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: i === 0 ? brand.tealDark : brand.strip, color: i === 0 ? '#fff' : 'text.secondary', fontSize: 12 }}>{i + 1}</Box><Typography variant="body2" fontWeight={i === 0 ? 700 : 400}>{label}</Typography></Box>)}
      </Box>
      {unitName && (
        <Typography variant="overline" color="text.secondary">
          {unitName}
        </Typography>
      )}
      <Typography variant="h1" sx={{ fontSize: { xs: '2rem', md: '3rem' }, mb: 2 }}>
        What sparks your curiosity?
      </Typography>
      <SpeechBubble mood="happy" sx={{ mb: 3 }}>
        <Typography>
          Your ideas belong here. Pick an interest and we’ll weave it into your lesson, all the way to your final project.
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
            onClick={() => setSelected(t)}
            aria-pressed={selected === t}
            disabled={busy !== null}
            sx={{
              flexDirection: 'column',
              gap: 1.5,
              position: 'relative',
              py: 3.5,
              minHeight: 145,
              transition: 'border-color 160ms, transform 160ms, background-color 160ms',
              borderRadius: 2,
              border: `2px solid ${selected === t ? brand.tealDark : brand.borderLight}`,
              bgcolor: selected === t ? brand.tealLight : '#fff',
              '&:hover': { borderColor: brand.tealDark, transform: 'translateY(-3px)' },
              '&:focus-visible': { outline: `3px solid ${brand.purple}` },
            }}
          >
            {selected === t && <CheckCircleRoundedIcon sx={{ position: 'absolute', top: 12, right: 12, color: 'primary.main', fontSize: 20 }} />}
            <Box sx={{ fontSize: 34 }} aria-hidden>
              {ICONS[t] ?? '✨'}
            </Box>
            <Typography sx={{ fontWeight: 700, textTransform: 'capitalize' }}>{t}</Typography>
          </ButtonBase>
        ))}
      </Box>
      <Box sx={{ mt: 4, pt: 3, borderTop: `1px solid ${brand.borderLight}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Typography color="text.secondary" variant="body2">No perfect choice needed. Start with what you like.</Typography>
        <Button variant="contained" size="large" endIcon={<ArrowForwardIcon />} disabled={!selected || busy !== null} onClick={() => selected && void choose(selected)}>{busy ? 'Getting ready…' : 'Make it mine'}</Button>
      </Box>
    </Container>
  );
}
