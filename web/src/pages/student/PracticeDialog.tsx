import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { api, type PracticeFeedback, type PracticeItem, type StudentLevel } from '../../api';
import { SpeechBubble } from '../../components/brand';
import { RichText } from '../../components/RichText';

/**
 * Low-stakes practice round for the current step (design §7A). The item may be
 * written by AI for this student; it has already passed the safety filter and the
 * quality check, or it is approved practice. Answers here never change the lesson.
 */
export function PracticeDialog({ open, onClose, level }: { open: boolean; onClose: () => void; level: StudentLevel }) {
  const [item, setItem] = useState<PracticeItem | null>(null);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<PracticeFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setItem(null);
    setAnswer('');
    setFeedback(null);
    setError(null);
    try {
      setItem(await api.createPractice(level.id));
    } catch (e) {
      setError((e as Error).message || "Couldn't load practice right now.");
    }
  };

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, level.id]);

  const send = async () => {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      setFeedback(await api.answerPractice(item.id, answer));
    } catch (e) {
      setError((e as Error).message || "Couldn't send that just now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="practice-title">
      <DialogTitle id="practice-title" sx={{ pb: 1 }}>
        Practice round
        <Typography variant="body2" color="text.secondary">
          Just for practice. It doesn't change your lesson.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {!item && !error && (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 4, gap: 1 }}>
            <CircularProgress aria-label="Making a practice round" />
            <Typography variant="body2" color="text.secondary">
              Making a practice round for you...
            </Typography>
          </Box>
        )}
        {item && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', flex: 1 }}>{item.title}</Typography>
              {item.aiGenerated && (
                <Chip size="small" icon={<AutoAwesomeOutlinedIcon />} label="Made for you by AI" variant="outlined" />
              )}
            </Box>
            <Typography>{item.scenario}</Typography>
            <Typography sx={{ fontWeight: 700 }}>{item.task}</Typography>
            <Typography variant="body2" color="text.secondary">
              Tip: {item.tip}
            </Typography>
            <TextField
              multiline
              minRows={4}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Write your answer here"
              inputProps={{ 'aria-label': 'Your practice answer', maxLength: 4000 }}
              disabled={busy}
            />
            {feedback && (
              <SpeechBubble tone={feedback.withheld ? 'caution' : 'coach'} mood="happy" role="status">
                <RichText text={feedback.feedback} />
              </SpeechBubble>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={() => void load()} disabled={busy || (!item && !error)}>
          Another one
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Back to my task</Button>
        <Button variant="contained" onClick={() => void send()} disabled={!item || busy || !answer.trim()}>
          {busy ? 'Checking...' : 'Get feedback'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
