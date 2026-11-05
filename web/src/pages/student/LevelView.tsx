import { useEffect, useRef, useState } from 'react';
import { Box, Button, InputBase, LinearProgress, Typography } from '@mui/material';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { useSession } from '../../session';
import { clearSessionDraft, useSessionDraft } from '../../hooks/useSessionDraft';
import { api, type StudentLevel, type SubmissionOutcome } from '../../api';
import { PaneHeader, SpeechBubble } from '../../components/brand';
import { brand } from '../../theme';
import { BitTutorPanel } from './BitTutorPanel';
import { Splitter, usePaneSize } from '../../components/Splitter';
import { FillEditor, ParsonsEditor } from './InteractionEditors';
import { PracticeDialog } from './PracticeDialog';
import { PreviewPanel } from './PreviewPanel';
import { SidePanel } from './SidePanel';

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
  onAdvance,
  unitId,
}: {
  level: StudentLevel;
  onAdvance: () => void;
  unitId?: string;
}) {
  const { user } = useSession();
  const draftKey = `codeai-draft:${user?.id}:${unitId ?? 'default'}:${level.id}`;
  const [response, setResponse, draftSaved] = useSessionDraft<string>(draftKey, '', (v): v is string => typeof v === 'string');
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'none' });
  // Resizable panes, remembered per browser (drag, arrow keys, or double-click to reset).
  const outer = useRef<HTMLDivElement>(null);
  const [leftPct, setLeftPct, leftMin, leftMax] = usePaneSize('left', 42, 25, 70);
  // Side panel on the right with two tabs: Bit (opened by Hint, which also asks for a
  // hint) and the AI preview (opened by Try it). It pushes the page; it never covers it.
  // Open/closed carries over to the next step (a new step has no preview yet, so it opens on Bit).
  const [side, setSideState] = useState<'bit' | 'preview' | null>(() => (readSideOpen() ? 'bit' : null));
  const setSide = (next: 'bit' | 'preview' | null | ((s: 'bit' | 'preview' | null) => 'bit' | 'preview' | null)) =>
    setSideState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      writeSideOpen(value !== null);
      return value;
    });
  const [sidePct, setSidePct, sideMin, sideMax] = usePaneSize('side', 32, 22, 55);
  const hintSignal = 0;
  // Your work always keeps at least 30% of the width: the side panel and then the
  // instructions give way, so nothing is ever squeezed under a neighbor.
  const sideEff = side ? Math.min(sidePct, 100 - 30 - 25) : 0;
  const leftEff = Math.min(leftPct, 100 - sideEff - 30);
  const [practiceOpen, setPracticeOpen] = useState(false);
  // "Try it": the prompt the preview was made from (null = panel closed).
  const [previewOf, setPreviewOf] = useState<string | null>(null);
  const cancelled = useRef(false);
  const feedbackArea = useRef<HTMLDivElement>(null);
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
          setFeedback({
            kind: 'error',
            message: 'This is taking longer than usual. Your work is saved, so try again in a moment.',
          });
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    } catch {
      setFeedback({ kind: 'error', message: "I couldn't send your work just now. It's still here, so try again." });
    }
  };

  useEffect(() => {
    if (feedback.kind === 'outcome' || feedback.kind === 'error') {
      feedbackArea.current?.focus({ preventScroll: true });
      feedbackArea.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [feedback]);

  const outcome = feedback.kind === 'outcome' ? feedback.outcome : null;
  const canContinue = outcome?.status === 'done' && outcome.nextAction === 'continue';
  const checking = feedback.kind === 'checking';
  const isProject = level.kind === 'project';
  const lineCount = Math.max(response.split('\n').length, isProject ? 14 : 10);

  return (
    <Box
      ref={outer}
      sx={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          md: `minmax(0, ${leftEff}%) 6px minmax(0, 1fr)${side ? ` 6px minmax(0, ${sideEff}%)` : ''}`,
        },
        gridTemplateRows: { xs: 'auto', md: '1fr' },
        height: { md: 'calc(100vh - 76px)' },
        p: { xs: 1, md: 2 },
        gap: { xs: 1, md: 0 },
        bgcolor: brand.bg,
        minWidth: 0,
      }}
    >
      {/* Instructions pane */}
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
        <Box
          component="section"
          aria-label="Instructions"
          sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 3, overflow: 'hidden' }}
        >
          <PaneHeader
            title="Instructions"
            right={
              <Typography variant="overline" color="text.secondary">
                {isProject ? 'Project' : 'Current step'}
              </Typography>
            }
          />
          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              px: { xs: 2, md: 3 },
              py: 3,
              display: 'flex',
              flexDirection: 'column',
              gap: 2.5,
            }}
          >
            <Typography variant="h2" component="h1">
              {level.title}
            </Typography>

            <SpeechBubble mood="happy">
              <Typography>{level.intro}</Typography>
            </SpeechBubble>

            <Box
              component="ol"
              sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1.25 }}
            >
              {level.instructions.map((text, i) => (
                <Box component="li" key={text} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                  <Box
                    sx={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      bgcolor: brand.tealLight,
                      color: brand.tealDark,
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

          </Box>
        </Box>
      </Box>

      <Splitter
        container={outer}
        axis="x"
        value={leftPct}
        min={leftMin}
        max={leftMax}
        onChange={setLeftPct}
        onReset={() => setLeftPct(42)}
        label="Resize the instructions and your work"
      />

      {/* Workspace pane */}
      <Box
        component="section"
        aria-label="Your work"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: { xs: 420, md: 0 },
          minWidth: 0,
          overflow: 'hidden',
          borderRadius: 3,
          border: `1px solid ${brand.borderLight}`,
          bgcolor: '#fff',
        }}
      >
        <PaneHeader
          title="Create & explore"
          right={
            !canContinue && (
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {level.preview && (
                  <Button
                    size="small"
                    startIcon={<VisibilityOutlinedIcon />}
                    disabled={!response.trim()}
                    onClick={() => {
                      setPreviewOf(promptPart(response));
                      setSide('preview');
                    }}
                    sx={{ color: brand.charcoal, fontWeight: 800 }}
                  >
                    Try it
                  </Button>
                )}
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
                  aria-expanded={side === 'bit'}
                  onClick={() => {
                    setSide((s) => (s === 'bit' ? null : 'bit'));
                  }}
                  sx={{
                    color: brand.charcoal,
                    ...(outcome?.status === 'done' && outcome.offerAssistant
                      ? { bgcolor: '#fff3d6', '&:hover': { bgcolor: '#ffe9b3' } }
                      : {}),
                  }}
                >
                  Ask Bit
                </Button>
              </Box>
            )
          }
        />
        {level.interaction ? (
          <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: brand.bg }}>
            {level.interaction.type === 'parsons' ? (
              <ParsonsEditor
                draftKey={`${draftKey}:order`}
                lines={level.interaction.lines}
                disabled={checking || canContinue}
                onChange={setResponse}
              />
            ) : (
              <FillEditor draftKey={`${draftKey}:blanks`} code={level.interaction.code} disabled={checking || canContinue} onChange={setResponse} />
            )}
          </Box>
        ) : (
          <>
            <Box sx={{ px: 2, pt: 1.5, pb: 1, bgcolor: '#fff', borderBottom: `1px solid ${brand.borderLight}` }}>
              <Typography component="label" htmlFor="workspace-editor" sx={{ fontWeight: 700, fontSize: 14 }}>
                {level.responseLabel}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>Start with your own words. You can revise your response after feedback.</Typography>
            </Box>

            <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: '#fff', display: 'flex', alignItems: 'stretch' }}>
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
                  px: 3,
                  py: 2.5,
                  fontFamily: 'inherit',
                  fontSize: 16,
                  '& textarea': { lineHeight: '28px', whiteSpace: 'pre-wrap' },
                  '& textarea::placeholder': { color: '#9aa3ab', opacity: 1 },
                }}
              />
            </Box>
          </>
        )}

        {feedback.kind !== 'none' && feedback.kind !== 'checking' && <Box ref={feedbackArea} tabIndex={-1} aria-label="Feedback on your work" sx={{ px: 2, py: 2, borderTop: `1px solid ${brand.borderLight}`, maxHeight: { md: '35vh' }, overflowY: 'auto' }}><Feedback feedback={feedback} /></Box>}
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
                : level.interaction?.type === 'parsons'
                  ? 'Check the order when you are ready.'
                  : level.interaction?.type === 'fill'
                    ? response
                      ? 'All blanks filled.'
                      : 'Fill every blank to check.'
                    : `${wordLabel(response)} · ${draftSaved ? 'Draft saved in this tab' : 'Keep this page open to preserve your draft'}`}
          </Typography>
          {canContinue ? (
            <Button variant="contained" size="large" endIcon={<ArrowForwardIcon />} onClick={() => { clearSessionDraft(draftKey); clearSessionDraft(`${draftKey}:order`); clearSessionDraft(`${draftKey}:blanks`); onAdvance(); }}>
              Next step
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
              {checking ? 'Reading your work…' : outcome?.status === 'done' ? 'Check my changes' : 'Get feedback'}
            </Button>
          )}
        </Box>
      </Box>

      {side && (
        <Splitter
          container={outer}
          axis="x"
          fromEnd
          value={sidePct}
          min={sideMin}
          max={sideMax}
          onChange={setSidePct}
          onReset={() => setSidePct(32)}
          label="Resize the side panel"
        />
      )}

      {/* Side panel: Bit and the AI preview as tabs. Kept mounted so the chat survives closing. */}
      <SidePanel
        tab={side}
        onTab={setSide}
        previewReady={previewOf !== null}
        bit={<BitTutorPanel level={level} hintSignal={hintSignal} embedded />}
        preview={
          previewOf !== null ? (
            <PreviewPanel
              key={previewOf}
              levelId={level.id}
              prompt={previewOf}
              onClose={() => setSide(null)}
              embedded
            />
          ) : null
        }
      />

      <PracticeDialog open={practiceOpen} onClose={() => setPracticeOpen(false)} level={level} />
    </Box>
  );
}

/**
 * The prompt part of an answer: students often write "Prompt: ..." plus other parts
 * ("Who might have trouble: ..."). Sends only the prompt to "Try it"; falls back to all text.
 */
function promptPart(text: string) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^\s*(follow-up\s+)?prompt\s*(\d+)?\s*:/i.test(l));
  if (start < 0) return text;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^\s*[A-Z][\w '’-]{1,30}:/.test(l));
  const block = [
    lines[start].replace(/^\s*(follow-up\s+)?prompt\s*(\d+)?\s*:\s*/i, ''),
    ...(end < 0 ? rest : rest.slice(0, end)),
  ];
  return block.join('\n').trim() || text;
}

const SIDE_KEY = 'codeai-side-open';

function readSideOpen() {
  try {
    return sessionStorage.getItem(SIDE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSideOpen(open: boolean) {
  try {
    sessionStorage.setItem(SIDE_KEY, open ? '1' : '0');
  } catch {
    // Storage unavailable: the panel just starts closed on the next step.
  }
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
