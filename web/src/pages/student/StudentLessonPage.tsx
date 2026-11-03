import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress } from '@mui/material';
import { api, type LessonState, type PathItem } from '../../api';
import { useHeaderSlot } from '../../components/AppShell';
import { DiagnosticView } from './DiagnosticView';
import { LevelView } from './LevelView';
import { ProgressBubbles } from './ProgressBubbles';
import { DepthChoiceView } from './DepthChoiceView';
import { CompleteView } from './CompleteView';

import { LESSON_NAME } from './lesson';

function useLessonHeader(path: PathItem[] | null) {
  const key = path ? path.map((p) => `${p.levelId}:${p.status}`).join('|') : 'none';
  useHeaderSlot(path ? <ProgressBubbles path={path} lessonName={LESSON_NAME} /> : null, key);
}

/**
 * Student lesson. Renders only what the student API returns: the current task,
 * their own work, formative coaching, and non-evaluative progress (FR13).
 */
export function StudentLessonPage() {
  const [state, setState] = useState<LessonState | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useLessonHeader(state && (state.phase === 'level' || state.phase === 'choose-depth') ? state.path : null);

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
    case 'diagnostic':
      return <DiagnosticView onDone={setState} />;
    case 'complete':
      return <CompleteView state={state} />;
    case 'choose-depth':
      return <DepthChoiceView options={state.options} onChosen={setState} />;
    case 'level':
      return (
        <LevelView key={state.level.id} level={state.level} stepNumber={state.stepsCompleted + 1} onAdvance={load} />
      );
  }
}
