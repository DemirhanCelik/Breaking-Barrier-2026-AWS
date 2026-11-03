import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import { api, type StudentLevel, type SubmissionOutcome } from '../../api';
import { AssistantDrawer } from './AssistantDrawer';

const POLL_MS = 400;
const POLL_TIMEOUT_MS = 20_000;

type Feedback =
  | { kind: 'none' }
  | { kind: 'checking' }
  | { kind: 'outcome'; outcome: Exclude<SubmissionOutcome, { status: 'checking' }> }
  | { kind: 'error'; message: string };

export function LevelView({ level, onAdvance }: { level: StudentLevel; onAdvance: () => void }) {
  const [response, setResponse] = useState('');
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'none' });
  const [assistantOpen, setAssistantOpen] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const submit = async () => {
    setFeedback({ kind: 'checking' });
    try {
      const { submissionId } = await api.submitWork(level.id, response);
      const started = Date.now();
      // Submit is accepted first, then the result is polled (design §6.2).
      for (;;) {
        if (cancelled.current) return;
        const outcome = await api.getSubmission(submissionId);
        if (outcome.status !== 'checking') {
          setFeedback({ kind: 'outcome', outcome });
          return;
        }
        if (Date.now() - started > POLL_TIMEOUT_MS) {
          setFeedback({ kind: 'error', message: 'This is taking longer than usual. Your work is saved, so try again in a moment.' });
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    } catch {
      setFeedback({ kind: 'error', message: "We couldn't send your work just now. It's still here, so try again." });
    }
  };

  const outcome = feedback.kind === 'outcome' ? feedback.outcome : null;
  const canContinue = outcome?.status === 'done' && outcome.nextAction === 'continue';
  const checking = feedback.kind === 'checking';
  const isProject = level.kind === 'project';

  return (
    <Stack spacing={2.5}>
      <Box>
        {isProject && <Chip label="Project" color="secondary" size="small" sx={{ mb: 1 }} />}
        <Typography variant="h1" gutterBottom>
          {level.title}
        </Typography>
        <Typography color="text.secondary">{level.intro}</Typography>
      </Box>

      {level.aiOutput && (
        <Paper sx={{ p: 2, bgcolor: '#0f1b2d', color: '#e6edf6', border: 'none' }}>
          <Typography variant="caption" sx={{ color: '#9fb3c8', display: 'block', mb: 1 }}>
            What the AI made
          </Typography>
          <Box component="pre" sx={{ m: 0, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 14, whiteSpace: 'pre-wrap' }}>
            {level.aiOutput}
          </Box>
        </Paper>
      )}

      <Paper sx={{ p: 2.5 }}>
        <Typography variant="h3" gutterBottom>
          What to do
        </Typography>
        <Box component="ol" sx={{ m: 0, pl: 3 }}>
          {level.instructions.map((i) => (
            <Typography component="li" key={i} sx={{ mb: 0.5 }}>
              {i}
            </Typography>
          ))}
        </Box>
      </Paper>

      <TextField
        label={level.responseLabel}
        placeholder={level.responsePlaceholder}
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        multiline
        minRows={isProject ? 10 : 6}
        fullWidth
        disabled={checking || canContinue}
        slotProps={{ input: { sx: { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', bgcolor: 'background.paper' } } }}
      />

      {checking && (
        <Box role="status">
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Reading your work…
          </Typography>
          <LinearProgress />
        </Box>
      )}

      {feedback.kind === 'error' && <Alert severity="warning">{feedback.message}</Alert>}

      {outcome?.status === 'withheld' && <Alert severity="warning">{outcome.message}</Alert>}

      {outcome?.status === 'done' && (
        <Alert severity="info" icon={<LightbulbOutlinedIcon />} role="status">
          {outcome.coaching}
        </Alert>
      )}

      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
        {canContinue ? (
          <Button variant="contained" size="large" onClick={onAdvance}>
            Next step
          </Button>
        ) : (
          <Button variant="contained" size="large" disabled={checking || response.trim().length === 0} onClick={submit}>
            {outcome?.status === 'done' ? 'Send my update' : 'Send my work'}
          </Button>
        )}
        {!canContinue && (
          <Button
            variant={outcome?.status === 'done' && outcome.offerAssistant ? 'outlined' : 'text'}
            startIcon={<LightbulbOutlinedIcon />}
            onClick={() => setAssistantOpen(true)}
          >
            Ask for a hint
          </Button>
        )}
      </Stack>

      <AssistantDrawer open={assistantOpen} onClose={() => setAssistantOpen(false)} level={level} />
    </Stack>
  );
}
