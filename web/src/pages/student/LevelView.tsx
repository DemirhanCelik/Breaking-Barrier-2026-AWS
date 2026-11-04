import { useEffect, useRef, useState } from 'react';
import { Box, Button, InputBase, LinearProgress, Typography } from '@mui/material';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { api, type StudentLevel, type SubmissionOutcome } from '../../api';
import { PaneHeader, SpeechBubble } from '../../components/brand';
import { brand } from '../../theme';
import { AssistantDrawer } from './AssistantDrawer';
import { PracticeDialog } from './PracticeDialog';

const POLL_MS = 400;
const POLL_TIMEOUT_MS = 20_000;
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

type Feedback =
  | { kind: 'none' }
  | { kind: 'checking' }
  | { kind: 'outcome'; outcome: Exclude<SubmissionOutcome, { status: 'checking' }> }
  | { kind: 'error'; message: string };

/** Lab layout: instructions on the left, the student's workspace on the right. */
export function LevelView({
  level,
  stepNumber,
  onAdvance,
}: {
  level: StudentLevel;
  stepNumber: number;
  onAdvance: () => void;
}) {
  const [response, setResponse] = useState('');
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'none' });
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const cancelled = useRef(false);
  // Quiet formative signals (never shown to the student): time on this attempt,
  // separate editing bursts, and pastes. Sent with the submission for the teacher
  // view and the routing advisor.
  const signals = useRef({ startedAt: Date.now(), lastEditAt: 0, edits: 0, pastes: 0, pastedChars: 0 });

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const submit = async () => {
    setFeedback({ kind: 'checking' });
    try {
      const sig = signals.current;
      const { submissionId } = await api.submitWork(level.id, response, {
        timeOnTaskSec: Math.round((Date.now() - sig.startedAt) / 1000),
        edits: sig.edits,
        pastes: sig.pastes,
        pastedChars: sig.pastedChars,
      });
      signals.current = { startedAt: Date.now(), lastEditAt: 0, edits: 0, pastes: 0, pastedChars: 0 };
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
      setFeedback({ kind: 'error', message: "I couldn't send your work just now. It's still here, so try again." });
    }
  };

  const outcome = feedback.kind === 'outcome' ? feedback.outcome : null;
  const canContinue = outcome?.status === 'done' && outcome.nextAction === 'continue';
  const checking = feedback.kind === 'checking';
  const isProject = level.kind === 'project';
  const lineCount = Math.max(response.split('\n').length, isProject ? 14 : 10);

  return (
    <Box
      sx={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(360px, 42%) 1fr' },
        gridTemplateRows: { xs: 'auto auto', md: '1fr' },
        height: { md: 'calc(100vh - 60px)' },
        bgcolor: brand.bg,
      }}
    >
      {/* Instructions pane */}
      <Box
        component="section"
        aria-label="Instructions"
        sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, bgcolor: '#fff', borderRight: { md: `1px solid ${brand.border}` } }}
      >
        <PaneHeader
          title="Instructions"
          right={
            <Typography variant="overline" color="text.secondary">
              {isProject ? 'Project' : `Step ${stepNumber}`}
            </Typography>
          }
        />
        <Box sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, md: 3 }, py: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Typography variant="h2" component="h1">
            {level.title}
          </Typography>

          <SpeechBubble mood="happy">
            <Typography>{level.intro}</Typography>
          </SpeechBubble>

          <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {level.instructions.map((text, i) => (
              <Box component="li" key={text} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                <Box
                  sx={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    bgcolor: brand.purple,
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: 13,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    mt: '1px',
                  }}
                  aria-hidden
                >
                  {i + 1}
                </Box>
                <Typography sx={{ fontWeight: 500 }}>{text}</Typography>
              </Box>
            ))}
          </Box>

          {level.aiOutput && (
            <Box sx={{ borderRadius: 1.5, overflow: 'hidden', border: `1px solid ${brand.slate}` }}>
              <PaneHeader title="What the AI made" dark />
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 2,
                  bgcolor: brand.editor,
                  color: '#d9e2ec',
                  fontFamily: MONO,
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {level.aiOutput}
              </Box>
            </Box>
          )}

          <Feedback feedback={feedback} />
        </Box>
      </Box>

      {/* Workspace pane */}
      <Box component="section" aria-label="Your work" sx={{ display: 'flex', flexDirection: 'column', minHeight: { xs: 420, md: 0 } }}>
        <PaneHeader
          title="Your work"
          right={
            !canContinue && (
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Button
                  size="small"
                  startIcon={<FitnessCenterOutlinedIcon />}
                  onClick={() => setPracticeOpen(true)}
                  sx={{ color: brand.charcoal }}
                >
                  Practice
                </Button>
                <Button
                  size="small"
                  startIcon={<LightbulbOutlinedIcon />}
                  onClick={() => setAssistantOpen(true)}
                  sx={{
                    color: brand.charcoal,
                    ...(outcome?.status === 'done' && outcome.offerAssistant
                      ? { bgcolor: '#fff3d6', '&:hover': { bgcolor: '#ffe9b3' } }
                      : {}),
                  }}
                >
                  Hint
                </Button>
              </Box>
            )
          }
        />
        <Box sx={{ px: 2, pt: 1.5, pb: 1, bgcolor: '#fff', borderBottom: `1px solid ${brand.borderLight}` }}>
          <Typography component="label" htmlFor="workspace-editor" sx={{ fontWeight: 700, fontSize: 14 }}>
            {level.responseLabel}
          </Typography>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: '#fff', display: 'flex', alignItems: 'stretch' }}>
          <Box
            aria-hidden
            sx={{
              py: 1.5,
              px: 1,
              minWidth: 44,
              textAlign: 'right',
              bgcolor: '#f7f8f9',
              borderRight: `1px solid ${brand.borderLight}`,
              color: '#9aa3ab',
              fontFamily: MONO,
              fontSize: 14,
              lineHeight: '24px',
              userSelect: 'none',
            }}
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </Box>
          <InputBase
            id="workspace-editor"
            multiline
            fullWidth
            minRows={lineCount}
            value={response}
            onChange={(e) => {
              const sig = signals.current;
              const now = Date.now();
              if (now - sig.lastEditAt > 3000) sig.edits += 1;
              sig.lastEditAt = now;
              setResponse(e.target.value);
            }}
            onPaste={(e) => {
              signals.current.pastes += 1;
              signals.current.pastedChars += e.clipboardData.getData('text').length;
            }}
            placeholder={level.responsePlaceholder}
            disabled={checking || canContinue}
            sx={{
              alignItems: 'flex-start',
              px: 1.5,
              py: 1.5,
              fontFamily: MONO,
              fontSize: 14,
              '& textarea': { lineHeight: '24px', whiteSpace: 'pre-wrap' },
              '& textarea::placeholder': { color: '#9aa3ab', opacity: 1 },
            }}
          />
        </Box>

        {checking && <LinearProgress color="warning" aria-label="Reading your work" />}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1.5,
            bgcolor: brand.strip,
            borderTop: `1px solid ${brand.border}`,
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }} role="status">
            {checking
              ? 'Bit is reading your work…'
              : canContinue
                ? 'Your work is saved.'
                : wordLabel(response)}
          </Typography>
          {canContinue ? (
            <Button variant="contained" size="large" endIcon={<ArrowForwardIcon />} onClick={onAdvance}>
              Continue
            </Button>
          ) : (
            <Button
              variant="contained"
              color="warning"
              size="large"
              startIcon={<PlayArrowRoundedIcon />}
              disabled={checking || response.trim().length === 0}
              onClick={submit}
            >
              {outcome?.status === 'done' ? 'Check again' : 'Check my work'}
            </Button>
          )}
        </Box>
      </Box>

      <AssistantDrawer open={assistantOpen} onClose={() => setAssistantOpen(false)} level={level} />
      <PracticeDialog open={practiceOpen} onClose={() => setPracticeOpen(false)} level={level} />
    </Box>
  );
}

function wordLabel(text: string) {
  const n = text.trim() ? text.trim().split(/\s+/).length : 0;
  return `${n} ${n === 1 ? 'word' : 'words'}`;
}

function Feedback({ feedback }: { feedback: Feedback }) {
  if (feedback.kind === 'error') {
    return (
      <SpeechBubble tone="caution" role="alert">
        <Typography>{feedback.message}</Typography>
      </SpeechBubble>
    );
  }
  if (feedback.kind !== 'outcome') return null;
  const o = feedback.outcome;
  if (o.status === 'withheld') {
    return (
      <SpeechBubble tone="caution" role="alert">
        <Typography>{o.message}</Typography>
      </SpeechBubble>
    );
  }
  return (
    <SpeechBubble tone="coach" mood={o.nextAction === 'continue' ? 'happy' : 'thinking'} role="status">
      <Typography variant="overline" sx={{ color: brand.tealDark, display: 'block' }}>
        {o.nextAction === 'continue' ? 'Nice!' : 'Try this'}
      </Typography>
      <Typography>{o.coaching}</Typography>
    </SpeechBubble>
  );
}
