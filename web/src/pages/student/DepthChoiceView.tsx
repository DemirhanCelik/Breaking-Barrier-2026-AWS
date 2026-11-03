import { useState } from 'react';
import { Alert, Box, Card, CardActionArea, CardContent, Stack, Typography } from '@mui/material';
import { api, type DepthOption, type LessonState } from '../../api';

/**
 * Shown once every required concept is at the bar. Optional depth is offered as
 * a choice of what to explore, not as a harder tier (FR6, Tenet 4).
 */
export function DepthChoiceView({ options, onChosen }: { options: DepthOption[]; onChosen: (s: LessonState) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      onChosen(await api.chooseDepth(id));
    } catch {
      setError("We couldn't open that just now. Please try again.");
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h1" gutterBottom>
          What do you want to work on next?
        </Typography>
        <Typography color="text.secondary">Pick one. You'll end up building your own club page either way.</Typography>
      </Box>
      {error && <Alert severity="warning">{error}</Alert>}
      {options.map((o) => (
        <Card key={o.id}>
          <CardActionArea disabled={busy} onClick={() => choose(o.id)}>
            <CardContent>
              <Typography variant="h3" gutterBottom>
                {o.label}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {o.description}
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>
      ))}
    </Stack>
  );
}
