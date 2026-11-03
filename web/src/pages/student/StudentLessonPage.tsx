import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Grid } from '@mui/material';
import { api, type LessonState } from '../../api';
import { DiagnosticView } from './DiagnosticView';
import { LevelView } from './LevelView';
import { PathPanel } from './PathPanel';
import { DepthChoiceView } from './DepthChoiceView';
import { CompleteView } from './CompleteView';

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

  if (error) {
    return (
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
    );
  }
  if (!state) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
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
      return (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 8 }}>
            <DepthChoiceView options={state.options} onChosen={setState} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <PathPanel path={state.path} stepsCompleted={state.stepsCompleted} />
          </Grid>
        </Grid>
      );
    case 'level':
      return (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 8 }}>
            <LevelView key={state.level.id} level={state.level} onAdvance={load} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <PathPanel path={state.path} stepsCompleted={state.stepsCompleted} />
          </Grid>
        </Grid>
      );
  }
}
