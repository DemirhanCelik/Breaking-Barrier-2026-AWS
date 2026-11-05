import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Container, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { api, type DiagnosticForm, type LessonState } from '../../api';
import { SpeechBubble } from '../../components/brand';
import { brand } from '../../theme';

/**
 * Self-placement, not a quiz (FR1). The student picks where they feel they are
 * with one tap; that single choice both selects and submits. No questions, no
 * score, no progress bar: it's warm and low-pressure by design (Tenet 4).
 */
export function DiagnosticView({ onDone, unitName, unitId: _unitId }: { onDone: (s: LessonState) => void; unitName?: string; unitId?: string }) {
  const [form, setForm] = useState<DiagnosticForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Which option is being submitted (shows a loading state on that one card).
  const [choosing, setChoosing] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const loadForm = useCallback(async () => {
    setLoadError(null);
    try {
      setForm(await api.getDiagnostic());
    } catch {
      setLoadError('We couldn’t load this just now. Please try again.');
    }
  }, []);
  useEffect(() => {
    void loadForm();
  }, [loadForm]);

  useEffect(() => {
    if (form) heading.current?.focus();
  }, [form]);

  const choose = async (optionId: string) => {
    if (choosing) return;
    setChoosing(optionId);
    setSubmitError(null);
    try {
      const next = await api.submitDiagnostic(optionId);
      onDone(next);
    } catch {
      setSubmitError("We couldn't set up your path just now. Please try again.");
      setChoosing(null);
    }
  };

  if (!form) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', flex: 1, p: 4 }}>
        {loadError ? (
          <Alert severity="warning" action={<Button color="inherit" onClick={loadForm}>Try again</Button>}>{loadError}</Alert>
        ) : (
          <CircularProgress aria-label="Loading" />
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', bgcolor: brand.bg }}>
      <Container
        maxWidth="sm"
        sx={{ py: { xs: 3, md: 6 }, flex: 1, display: 'flex', flexDirection: 'column', gap: 2.5 }}
      >
        <Typography variant="overline" color="text.secondary">
          {unitName ?? 'Lesson'} · Getting started
        </Typography>
        <Typography
          ref={heading}
          tabIndex={-1}
          variant="h1"
          sx={{ fontSize: { xs: '1.9rem', md: '2.4rem' }, outline: 'none' }}
        >
          Where would you like to start?
        </Typography>
        <SpeechBubble mood="happy">
          <Typography>{form.intro}</Typography>
        </SpeechBubble>
        <Typography color="text.secondary">
          Pick whatever feels right. There’s no wrong answer, and you can grow from wherever you begin.
        </Typography>

        <Box sx={{ display: 'grid', gap: 1.5, mt: 1 }}>
          {form.options.map((o) => {
            const busy = choosing === o.id;
            const disabled = choosing !== null;
            return (
              <Box
                key={o.id}
                component="button"
                type="button"
                disabled={disabled}
                aria-label={`${o.label}. ${o.description}`}
                onClick={() => void choose(o.id)}
                sx={{
                  all: 'unset',
                  cursor: disabled ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  px: 2.5,
                  py: 2.25,
                  borderRadius: 2,
                  bgcolor: busy ? brand.tealLight : '#fff',
                  border: `2px solid ${busy ? brand.teal : brand.borderLight}`,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  opacity: disabled && !busy ? 0.6 : 1,
                  transition: 'border-color 120ms, background-color 120ms, transform 120ms, opacity 120ms',
                  '&:hover': disabled ? {} : { borderColor: brand.teal, transform: 'translateY(-1px)' },
                  '&:focus-visible': { outline: `3px solid ${brand.orange}`, outlineOffset: 2 },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '1.1rem' }}>{o.label}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {busy ? 'Setting up your path…' : o.description}
                  </Typography>
                </Box>
                {busy ? (
                  <CircularProgress size={22} aria-hidden sx={{ color: brand.tealDark, flexShrink: 0 }} />
                ) : (
                  <ArrowForwardIcon sx={{ color: brand.tealDark, flexShrink: 0 }} />
                )}
              </Box>
            );
          })}
        </Box>

        {submitError && (
          <Typography color="error" role="alert">
            {submitError}
          </Typography>
        )}
      </Container>
    </Box>
  );
}
