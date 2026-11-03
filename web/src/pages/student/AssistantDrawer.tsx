import { useState } from 'react';
import { Box, Button, Drawer, IconButton, InputBase, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { api, type StudentLevel } from '../../api';
import { Bit } from '../../components/brand';
import { brand, headingFont } from '../../theme';

interface Message {
  from: 'student' | 'assistant';
  text: string;
  withheld?: boolean;
}

const STARTERS = ["I'm stuck. Where do I start?", 'What is this step asking for?', 'Can you check my idea?'];

/** AI helper scoped to the current step (FR8). Input and output pass the content filter. */
export function AssistantDrawer({ open, onClose, level }: { open: boolean; onClose: () => void; level: StudentLevel }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const send = async (raw?: string) => {
    const text = (raw ?? draft).trim();
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
    <Drawer anchor="right" open={open} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 420 }, bgcolor: brand.bg } } }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, bgcolor: brand.charcoal, color: '#fff' }}>
          <Bit size={40} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontFamily: headingFont, fontWeight: 700, fontSize: '1.2rem' }}>Ask Bit</Typography>
            <Typography variant="caption" sx={{ opacity: 0.75, display: 'block' }} noWrap>
              Hints for: {level.title}
            </Typography>
          </Box>
          <IconButton onClick={onClose} aria-label="Close hints" sx={{ color: '#fff' }}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }} aria-live="polite">
          {messages.length === 0 && (
            <>
              <Bubble from="assistant">
                Stuck? Tell me what you're trying to do and I'll give you a nudge. I won't write the answer for you.
              </Bubble>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                {STARTERS.map((s) => (
                  <Button
                    key={s}
                    size="small"
                    variant="outlined"
                    onClick={() => send(s)}
                    sx={{ bgcolor: '#fff', borderColor: brand.border, color: brand.charcoal, fontWeight: 600 }}
                  >
                    {s}
                  </Button>
                ))}
              </Box>
            </>
          )}
          {messages.map((m, i) => (
            <Bubble key={i} from={m.from} withheld={m.withheld}>
              {m.text}
            </Bubble>
          ))}
          {sending && <Bubble from="assistant">…</Bubble>}
        </Box>

        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          sx={{ display: 'flex', gap: 1, p: 1.5, bgcolor: '#fff', borderTop: `1px solid ${brand.border}` }}
        >
          <InputBase
            fullWidth
            placeholder="Ask a question"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            inputProps={{ 'aria-label': 'Ask Bit a question' }}
            sx={{ px: 1.5, borderRadius: 1, bgcolor: brand.bg }}
          />
          <Button type="submit" variant="contained" disabled={sending || !draft.trim()} aria-label="Send">
            <SendRoundedIcon fontSize="small" />
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}

function Bubble({ from, withheld, children }: { from: 'student' | 'assistant'; withheld?: boolean; children: React.ReactNode }) {
  const mine = from === 'student';
  return (
    <Box
      sx={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        px: 1.75,
        py: 1.25,
        borderRadius: 2,
        borderBottomRightRadius: mine ? 4 : undefined,
        borderBottomLeftRadius: mine ? undefined : 4,
        bgcolor: mine ? brand.tealDark : withheld ? '#fff7e6' : '#fff',
        color: mine ? '#fff' : brand.charcoal,
        border: mine ? 'none' : `1px solid ${withheld ? brand.orange : brand.borderLight}`,
      }}
    >
      <Typography variant="body2">{children}</Typography>
    </Box>
  );
}
