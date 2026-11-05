import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress } from '@mui/material';
import { api, type LessonState, type PathItem } from '../../api';
import { useHeaderSlot } from '../../components/AppShell';
import { DiagnosticView } from './DiagnosticView';
import { LevelView } from './LevelView';
import { ProgressBar } from './ProgressBar';
import { DepthChoiceView } from './DepthChoiceView';
import { CompleteView } from './CompleteView';

import { TopicPicker } from './TopicPicker';

function useLessonHeader(path: PathItem[] | null, lessonName: string) {
  // Key only on the lesson + which step is current (not the whole path), so the
  // bar's DOM node persists across re-routes and its width animates to the new
  // proportion instead of resetting.
  const current = path?.find((p) => p.status === 'current')?.levelId ?? 'none';
  const key = path ? `${lessonName}|${current}` : 'none';
  useHeaderSlot(path ? <ProgressBar path={path} lessonName={lessonName} /> : null, key);
}

/**
 * Student lesson. Renders only what the student API returns: the current task,
 * their own work, formative coaching, and non-evaluative progress (FR13).
 */
export function StudentLessonPage() {
  const [state, setState] = useState<LessonState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One-time welcome right after the warm-up (number-free, never a placement result).
  const [welcome, setWelcome] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(await api.getLessonState());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLessonHeader(
    state && (state.phase === 'level' || state.phase === 'choose-depth') ? state.path : null,
    state?.unit?.name ?? 'Lesson',
  );

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert
          severity="warning"
          action={
            <Button color="inherit" onClick={load}>
              Try again
            </Button>
          }
        >
          We couldn't load your lesson just now.
        </Alert>
      </Box>
    );
  }
  if (!state) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', flex: 1 }}>
        <CircularProgress aria-label="Loading lesson" />
      </Box>
    );
  }

  switch (state.phase) {
    case 'topic':
      return <TopicPicker topics={state.topics} unitName={state.unit?.name} onChosen={setState} />;
    case 'diagnostic':
      return <DiagnosticView key={state.unit?.id ?? 'default'} unitId={state.unit?.id} onDone={(next) => { setWelcome(true); setState(next); }} unitName={state.unit?.name} />;
    case 'complete':
      return <CompleteView state={state} />;
    case 'choose-depth':
      return <DepthChoiceView options={state.options} onChosen={setState} />;
    case 'level':
      return (
        <LevelView key={`${state.unit?.id ?? 'default'}:${state.level.id}`} unitId={state.unit?.id} level={state.level} teacherNotes={state.teacherNotes} welcome={welcome} onAdvance={() => { setWelcome(false); void load(); }} />
      );
  }
}
