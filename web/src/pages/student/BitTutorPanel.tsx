import { useEffect, useRef, useState } from 'react';
import { Box, Button, IconButton, InputBase, Typography } from '@mui/material';
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
export const HINT_REQUEST = 'Can I get a hint for this step?';

/**
 * Bit, the AI tutor, always visible under the task (FR8). Scoped to the current step;
 * the API filters the question and the reply, and Bit never writes the answer.
 * `hintSignal` changes when the student presses "Hint": Bit is asked for a hint here.
 */
export function BitTutorPanel({
  level,
  hintSignal,
  onClose,
}: {
  level: StudentLevel;
  hintSignal: number;
  onClose?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const send = async (raw?: string) => {
    const text = (raw ?? draft).trim();
    if (!text || sending) return;
    setMessages((m) => [...m, { from: 'student', text }]);
    setDraft('');
    setSending(true);
    try {
      const r = await api.askAssistant(level.id, text);
      setMessages((m) => [...m, { from: 'assistant', text: r.reply, withheld: r.withheld }]);
    } catch {
      setMessages((m) => [
        ...m,
        { from: 'assistant', text: "I couldn't answer just now. Try again in a moment.", withheld: true },
      ]);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (hintSignal > 0) void send(HINT_REQUEST);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintSignal]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  return (
    <Box
      component="section"
      aria-label="Ask Bit, your AI tutor"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        bgcolor: brand.bg,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          px: 2,
          py: 1,
          bgcolor: '#fff',
          borderBottom: `1px solid ${brand.borderLight}`,
        }}
      >
        <Bit size={30} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontFamily: headingFont, fontWeight: 700, lineHeight: 1.1 }}>Ask Bit</Typography>
          <Typography variant="caption" color="text.secondary" noWrap display="block">
            Your AI tutor for this step. Bit nudges; it won't write the answer.
          </Typography>
        </Box>
        {onClose && (
          <IconButton size="small" aria-label="Close Bit" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      <Box
        ref={scroller}
        sx={{ flex: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}
        aria-live="polite"
      >
        {messages.length === 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {STARTERS.map((s) => (
              <Button
                key={s}
                size="small"
                variant="outlined"
                onClick={() => void send(s)}
                sx={{
                  bgcolor: '#fff',
                  borderColor: brand.border,
                  color: brand.charcoal,
                  fontWeight: 600,
                  textTransform: 'none',
                }}
              >
                {s}
              </Button>
            ))}
          </Box>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} from={m.from} withheld={m.withheld}>
            {m.text}
          </Bubble>
        ))}
        {sending && <Bubble from="assistant">Bit is thinking…</Bubble>}
      </Box>

      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        sx={{ display: 'flex', gap: 1, p: 1, bgcolor: '#fff', borderTop: `1px solid ${brand.borderLight}` }}
      >
        <InputBase
          fullWidth
          placeholder="Ask Bit a question"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          inputProps={{ 'aria-label': 'Ask Bit a question', maxLength: 1000 }}
          sx={{ px: 1.5, borderRadius: 1, bgcolor: brand.bg }}
        />
        <Button type="submit" variant="contained" disabled={sending || !draft.trim()} aria-label="Send">
          <SendRoundedIcon fontSize="small" />
        </Button>
      </Box>
    </Box>
  );
}

function Bubble({
  from,
  withheld,
  children,
}: {
  from: 'student' | 'assistant';
  withheld?: boolean;
  children: React.ReactNode;
}) {
  const mine = from === 'student';
  return (
    <Box
      sx={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '88%',
        px: 1.5,
        py: 1,
        borderRadius: 2,
        borderBottomRightRadius: mine ? 4 : undefined,
        borderBottomLeftRadius: mine ? undefined : 4,
        bgcolor: mine ? brand.tealDark : withheld ? '#fff7e6' : '#fff',
        color: mine ? '#fff' : brand.charcoal,
        border: mine ? 'none' : `1px solid ${withheld ? brand.orange : brand.borderLight}`,
      }}
    >
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
        {children}
      </Typography>
    </Box>
  );
}
