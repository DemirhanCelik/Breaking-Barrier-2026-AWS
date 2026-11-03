import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormLabel,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from '@mui/material';
import { api, type DiagnosticAnswers, type DiagnosticForm, type LessonState } from '../../api';

/** Short warm-up that places the student per concept (FR1). Framed as a warm-up, never as a test. */
export function DiagnosticView({ onDone }: { onDone: (s: LessonState) => void }) {
  const [form, setForm] = useState<DiagnosticForm | null>(null);
  const [answers, setAnswers] = useState<DiagnosticAnswers>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getDiagnostic().then(setForm).catch((e: Error) => setError(e.message));
  }, []);

  if (error && !form) return <Alert severity="warning">We couldn't load the warm-up. Please reload the page.</Alert>;
  if (!form) return <CircularProgress aria-label="Loading warm-up" />;

  const allAnswered = form.items.every((i) => answers[i.id]);

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
    <Stack spacing={3} sx={{ maxWidth: 760, mx: 'auto' }}>
      <Box>
        <Typography variant="overline" color="primary">
          Warm-up
        </Typography>
        <Typography variant="h1" gutterBottom>
          Build a page for the Robotics Club
        </Typography>
        <Typography color="text.secondary">{form.intro}</Typography>
      </Box>

      {form.items.map((item, idx) => (
        <Paper key={item.id} sx={{ p: 3 }}>
          <FormControl>
            <FormLabel id={`${item.id}-label`} sx={{ color: 'text.primary', fontWeight: 600, mb: 1 }}>
              {idx + 1}. {item.prompt}
            </FormLabel>
            <RadioGroup
              aria-labelledby={`${item.id}-label`}
              value={answers[item.id] ?? ''}
              onChange={(e) => setAnswers((a) => ({ ...a, [item.id]: e.target.value }))}
            >
              {item.options.map((o) => (
                <FormControlLabel key={o.id} value={o.id} control={<Radio />} label={o.text} sx={{ py: 0.25 }} />
              ))}
            </RadioGroup>
          </FormControl>
        </Paper>
      ))}

      {error && <Alert severity="warning">{error}</Alert>}
      <Box>
        <Button variant="contained" size="large" disabled={!allAnswered || submitting} onClick={submit}>
          {submitting ? 'Getting your path ready…' : "Let's start"}
        </Button>
      </Box>
    </Stack>
  );
}
