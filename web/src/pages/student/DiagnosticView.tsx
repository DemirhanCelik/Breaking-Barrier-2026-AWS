import { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Container, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { api, type DiagnosticAnswers, type DiagnosticForm, type LessonState } from '../../api';
import { SpeechBubble } from '../../components/brand';
import { brand } from '../../theme';
import { LESSON_NAME } from './lesson';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** Short warm-up that places the student per concept (FR1). Framed as a warm-up, never as a test. */
export function DiagnosticView({ onDone }: { onDone: (s: LessonState) => void }) {
  const [form, setForm] = useState<DiagnosticForm | null>(null);
  const [answers, setAnswers] = useState<DiagnosticAnswers>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getDiagnostic().then(setForm).catch((e: Error) => setError(e.message));
  }, []);

  if (!form) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', flex: 1, p: 4 }}>
        {error ? <Typography>We couldn't load the warm-up. Please reload the page.</Typography> : <CircularProgress aria-label="Loading warm-up" />}
      </Box>
    );
  }

  const answered = form.items.filter((i) => answers[i.id]).length;
  const allAnswered = answered === form.items.length;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      onDone(await api.submitDiagnostic(answers));
    } catch {
      setError("We couldn't save your answers. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ bgcolor: brand.purple, color: '#fff', py: { xs: 4, md: 5 } }}>
        <Container maxWidth="md">
          <Typography variant="overline" sx={{ opacity: 0.85 }}>
            {LESSON_NAME}
          </Typography>
          <Typography variant="h1" sx={{ fontSize: { xs: '2rem', md: '2.6rem' }, mt: 0.5 }}>
            Warm-up: how would you do it?
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ py: 4, flex: 1 }}>
        <SpeechBubble sx={{ mb: 4 }}>
          <Typography>{form.intro}</Typography>
        </SpeechBubble>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {form.items.map((item, idx) => (
            <Box key={item.id} component="fieldset" sx={{ border: 'none', m: 0, p: 0 }}>
              <Typography component="legend" variant="h3" sx={{ mb: 1.5, display: 'flex', gap: 1.5, alignItems: 'baseline' }}>
                <Box component="span" sx={{ color: brand.purple }}>
                  {idx + 1}.
                </Box>
                {item.prompt}
              </Typography>
              {item.figure && (
                <Box
                  component="pre"
                  aria-label="Diagram"
                  sx={{
                    m: 0,
                    mb: 1.5,
                    p: 1.5,
                    bgcolor: '#f7f8f9',
                    border: `1px solid ${brand.borderLight}`,
                    borderRadius: 1.5,
                    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                    fontSize: 14,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {item.figure}
                </Box>
              )}
              <Box role="radiogroup" aria-label={item.prompt} sx={{ display: 'grid', gap: 1.25 }}>
                {item.options.map((o, oi) => {
                  const selected = answers[item.id] === o.id;
                  return (
                    <Box
                      key={o.id}
                      component="button"
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setAnswers((a) => ({ ...a, [item.id]: o.id }))}
                      sx={{
                        all: 'unset',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        px: 2,
                        py: 1.5,
                        borderRadius: 1.5,
                        bgcolor: selected ? brand.tealLight : '#fff',
                        border: `2px solid ${selected ? brand.teal : brand.borderLight}`,
                        boxShadow: selected ? 'none' : '0 1px 0 rgba(0,0,0,0.04)',
                        transition: 'border-color 120ms, background-color 120ms',
                        '&:hover': { borderColor: brand.teal },
                        '&:focus-visible': { outline: `3px solid ${brand.orange}`, outlineOffset: 2 },
                      }}
                    >
                      <Box
                        sx={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          flexShrink: 0,
                          display: 'grid',
                          placeItems: 'center',
                          fontWeight: 800,
                          fontSize: 14,
                          bgcolor: selected ? brand.tealDark : brand.strip,
                          color: selected ? '#fff' : brand.charcoal,
                        }}
                      >
                        {LETTERS[oi]}
                      </Box>
                      <Typography sx={{ fontWeight: selected ? 600 : 500 }}>{o.text}</Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          ))}
        </Box>
      </Container>

      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          bgcolor: '#fff',
          borderTop: `1px solid ${brand.border}`,
          py: 1.5,
        }}
      >
        <Container maxWidth="md" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="body2" color={error ? 'error' : 'text.secondary'} sx={{ flex: 1 }} role="status">
            {error ?? `${answered} of ${form.items.length} answered`}
          </Typography>
          <Button
            variant="contained"
            color="warning"
            size="large"
            endIcon={<ArrowForwardIcon />}
            disabled={!allAnswered || submitting}
            onClick={submit}
          >
            {submitting ? 'Getting your path ready…' : 'Start the lesson'}
          </Button>
        </Container>
      </Box>
    </Box>
  );
}
