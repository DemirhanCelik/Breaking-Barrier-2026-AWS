import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Container, LinearProgress, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useSession } from '../../session';
import { clearSessionDraft, useSessionDraft } from '../../hooks/useSessionDraft';
import { api, type DiagnosticAnswers, type DiagnosticForm, type LessonState } from '../../api';
import { SpeechBubble } from '../../components/brand';
import { brand } from '../../theme';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/**
 * Warm-up that places the student per concept (FR1). One question at a time, like
 * a quick quiz card, never framed as a test: no right/wrong is shown. Students
 * confirm with Next so they can consider or change their answer. Keys 1-4 or A-D pick an answer.
 */
export function DiagnosticView({ onDone, unitName, unitId }: { onDone: (s: LessonState) => void; unitName?: string; unitId?: string }) {
  const [form, setForm] = useState<DiagnosticForm | null>(null);
  const { user } = useSession();
  const draftKey = `codeai-warmup:${user?.id}:${unitId ?? unitName ?? 'default'}`;
  const [answers, setAnswers, saved] = useSessionDraft<DiagnosticAnswers>(draftKey, {}, (v): v is DiagnosticAnswers => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((answer) => typeof answer === 'string'));
  const [index, setIndex] = useState(-1); // -1 = intro card
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const loadForm = useCallback(async () => {
    setError(null);
    try { setForm(await api.getDiagnostic()); }
    catch { setError('We couldn’t load your warm-up. Please try again.'); }
  }, []);
  useEffect(() => { void loadForm(); }, [loadForm]);

  useEffect(() => {
    heading.current?.focus();
  }, [index]);

  const total = form?.items.length ?? 0;
  const item = form && index >= 0 ? form.items[index] : null;
  const done = form ? form.items.every((i) => i.options.some((option) => option.id === answers[i.id])) : false;

  const choose = (optionId: string) => {
    if (!item || submitting) return;
    setAnswers((a) => ({ ...a, [item.id]: optionId }));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!item || submitting || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const pos = /^[1-9]$/.test(k) ? Number(k) - 1 : 'abcde'.indexOf(k);
      if (pos >= 0 && pos < item.options.length) choose(item.options[pos].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const next = await api.submitDiagnostic(answers);
      clearSessionDraft(draftKey);
      onDone(next);
    } catch {
      setError("We couldn't save your answers. Please try again.");
      setSubmitting(false);
    }
  };

  if (!form) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', flex: 1, p: 4 }}>
        {error ? (
          <Alert severity="warning" action={<Button color="inherit" onClick={loadForm}>Try again</Button>}>{error}</Alert>
        ) : (
          <CircularProgress aria-label="Loading warm-up" />
        )}
      </Box>
    );
  }

  const answeredCount = form.items.filter((i) => answers[i.id]).length;

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', bgcolor: brand.bg }}>
      <LinearProgress
        variant="determinate"
        value={(answeredCount / total) * 100}
        aria-label={`${answeredCount} of ${total} answered`}
        sx={{ height: 6, bgcolor: brand.strip, '& .MuiLinearProgress-bar': { bgcolor: brand.teal } }}
      />
      <Container
        maxWidth="sm"
        sx={{ py: { xs: 3, md: 6 }, flex: 1, display: 'flex', flexDirection: 'column', gap: 2.5 }}
      >
        <Typography variant="overline" color="text.secondary">
          {unitName ?? 'Lesson'} · Warm-up
        </Typography>

        {index < 0 ? (
          <>
            <Typography
              ref={heading}
              tabIndex={-1}
              variant="h1"
              sx={{ fontSize: { xs: '1.9rem', md: '2.4rem' }, outline: 'none' }}
            >
              Quick warm-up
            </Typography>
            <SpeechBubble mood="happy">
              <Typography>{form.intro}</Typography>
            </SpeechBubble>
            <Typography color="text.secondary">
              {answeredCount ? `${answeredCount} of ${total} answers are saved in this tab. Pick up where you left off.` : `${total} quick questions, one at a time. Go with your best guess; it’s fine not to know.`}
            </Typography>
            <Box>
              <Button
                variant="contained"
                color="warning"
                size="large"
                endIcon={<ArrowForwardIcon />}
                onClick={() => { const next = form.items.findIndex((q) => !answers[q.id]); setIndex(next < 0 ? total - 1 : next); }}
              >
                {answeredCount ? 'Continue my warm-up' : 'Let’s go'}
              </Button>
            </Box>
          </>
        ) : (
          item && (
            <>
              <Typography variant="body2" color="text.secondary" aria-live="polite">
                Question {index + 1} of {total} · Take your time
              </Typography>
              <Typography
                ref={heading}
                tabIndex={-1}
                variant="h2"
                component="h1"
                sx={{ fontSize: { xs: '1.25rem', md: '1.45rem' }, lineHeight: 1.35, outline: 'none' }}
              >
                {item.prompt}
              </Typography>
              {item.figure && (
                <Box
                  component="pre"
                  aria-label="Diagram"
                  sx={{
                    m: 0,
                    p: 1.75,
                    bgcolor: brand.editor,
                    color: '#d9e2ec',
                    borderRadius: 1.5,
                    fontFamily: MONO,
                    fontSize: 14.5,
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
                      disabled={submitting}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => choose(o.id)}
                      sx={{
                        all: 'unset',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        px: 2,
                        py: 1.5,
                        borderRadius: 2,
                        bgcolor: selected ? brand.tealLight : '#fff',
                        border: `2px solid ${selected ? brand.teal : brand.borderLight}`,
                        boxShadow: selected ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
                        transition: 'border-color 120ms, background-color 120ms, transform 120ms',
                        '&:hover': { borderColor: brand.teal, transform: 'translateY(-1px)' },
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

              <Typography variant="caption" color="text.secondary">Choose an answer, then select Next. You can go back and change your mind. {saved ? 'Answers are saved in this tab.' : 'Keep this page open to preserve your answers.'}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1, flexWrap: 'wrap' }}>
                <Button
                  startIcon={<ArrowBackIcon />}
                  disabled={submitting}
                  onClick={() => setIndex((i) => i - 1)}
                  sx={{ color: brand.charcoal }}
                >
                  Back
                </Button>
                <Box sx={{ flex: 1 }} />
                {/* Dots: answered questions are filled; click to revisit. */}
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {form.items.map((q, i) => (
                    <Box
                      key={q.id}
                      component="button"
                      type="button"
                      disabled={submitting}
                      aria-label={`Go to question ${i + 1}${answers[q.id] ? ' (answered)' : ''}`}
                      onClick={() => setIndex(i)}
                      sx={{
                        all: 'unset',
                        cursor: 'pointer',
                        width: i === index ? 18 : 8,
                        height: 8,
                        borderRadius: 4,
                        bgcolor: i === index ? brand.purple : answers[q.id] ? brand.teal : brand.border,
                        transition: 'width 150ms',
                        '&:focus-visible': { outline: `2px solid ${brand.orange}` },
                      }}
                    />
                  ))}
                </Box>
                <Box sx={{ flex: 1 }} />
                {index < total - 1 ? (
                  <Button
                    variant="contained"
                    endIcon={<ArrowForwardIcon />}
                    disabled={!answers[item.id]}
                    onClick={() => setIndex((i) => i + 1)}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    color="warning"
                    size="large"
                    endIcon={<ArrowForwardIcon />}
                    disabled={!done || submitting}
                    onClick={submit}
                  >
                    {submitting ? 'Getting your path ready…' : 'Start the lesson'}
                  </Button>
                )}
              </Box>
              {error && (
                <Typography color="error" role="alert">
                  {error}
                </Typography>
              )}
            </>
          )
        )}
      </Container>
    </Box>
  );
}
