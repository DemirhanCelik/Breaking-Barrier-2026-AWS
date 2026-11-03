import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { api, type StudentLevel } from '../../api';

interface Message {
  from: 'student' | 'assistant';
  text: string;
  withheld?: boolean;
}

/** AI assistant scoped to the current step (FR8). Input and output pass the content filter. */
export function AssistantDrawer({ open, onClose, level }: { open: boolean; onClose: () => void; level: StudentLevel }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((m) => [...m, { from: 'student', text }]);
    setDraft('');
    setSending(true);
    try {
      const r = await api.askAssistant(level.id, text);
      setMessages((m) => [...m, { from: 'assistant', text: r.reply, withheld: r.withheld }]);
    } catch {
      setMessages((m) => [...m, { from: 'assistant', text: "I couldn't answer just now. Try again in a moment.", withheld: true }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 400 } } } }}>
      <Stack sx={{ height: '100%' }}>
        <Stack direction="row" alignItems="center" sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h3">Hint helper</Typography>
            <Typography variant="caption" color="text.secondary">
              Helps with: {level.title}
            </Typography>
          </Box>
          <IconButton onClick={onClose} aria-label="Close hint helper">
            <CloseIcon />
          </IconButton>
        </Stack>

        <Stack spacing={1.5} sx={{ flex: 1, overflowY: 'auto', p: 2 }} aria-live="polite">
          {messages.length === 0 && (
            <Typography color="text.secondary" variant="body2">
              Stuck? Tell me what you're trying to do and I'll give you a nudge. I won't write the answer for you.
            </Typography>
          )}
          {messages.map((m, i) =>
            m.withheld ? (
              <Alert key={i} severity="warning">
                {m.text}
              </Alert>
            ) : (
              <Box
                key={i}
                sx={{
                  alignSelf: m.from === 'student' ? 'flex-end' : 'flex-start',
                  bgcolor: m.from === 'student' ? 'primary.main' : 'grey.100',
                  color: m.from === 'student' ? 'primary.contrastText' : 'text.primary',
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                  maxWidth: '85%',
                }}
              >
                <Typography variant="body2">{m.text}</Typography>
              </Box>
            ),
          )}
        </Stack>

        <Stack direction="row" spacing={1} sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Ask a question"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            slotProps={{ htmlInput: { 'aria-label': 'Ask the hint helper a question' } }}
          />
          <Button variant="contained" onClick={send} disabled={sending || !draft.trim()}>
            Ask
          </Button>
        </Stack>
      </Stack>
    </Drawer>
  );
}
