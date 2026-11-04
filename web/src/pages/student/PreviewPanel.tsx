import { useEffect, useState } from 'react';
import { Alert, Box, Button, IconButton, LinearProgress, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { api, type PreviewResult } from '../../api';
import { brand } from '../../theme';

/**
 * Shows what an AI built from the student's prompt. The page is untrusted model
 * output, so it renders in an iframe with `sandbox=""` (no scripts, no forms, no
 * same-origin access) and the API also strips scripts and adds a no-network CSP.
 * Formative only: nothing here is scored.
 */
export function PreviewPanel({ levelId, prompt, onClose }: { levelId: string; prompt: string; onClose: () => void }) {
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .previewPrompt(levelId, prompt)
      .then((r) => live && setResult(r))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [levelId, prompt]);

  return (
    <Box
      component="section"
      aria-label="AI preview"
      sx={{
        borderTop: `1px solid ${brand.border}`,
        bgcolor: '#fff',
        display: 'flex',
        flexDirection: 'column',
        height: { xs: 340, md: '45%' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.75, bgcolor: brand.strip }}>
        <Typography variant="body2" sx={{ fontWeight: 800, flex: 1 }}>
          What the AI built from your prompt
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
          Just a preview. Not checked or scored.
        </Typography>
        <IconButton size="small" aria-label="Close preview" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      {!result && !error && (
        <>
          <LinearProgress />
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            The AI is building your page...
          </Typography>
        </>
      )}
      {error && (
        <Alert severity="warning" sx={{ m: 2 }} action={<Button onClick={onClose}>OK</Button>}>
          {error}
        </Alert>
      )}
      {result?.withheld && (
        <Alert severity="info" sx={{ m: 2 }}>
          {result.message}
        </Alert>
      )}
      {result && !result.withheld && (
        <Box
          component="iframe"
          title="AI-built page preview"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={result.html}
          sx={{ flex: 1, width: '100%', border: 0, bgcolor: '#fff' }}
        />
      )}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ px: 2, py: 0.75, borderTop: `1px solid ${brand.borderLight}` }}
      >
        Does it match what you wanted? If not, change your prompt to be more specific and try again.
      </Typography>
    </Box>
  );
}
