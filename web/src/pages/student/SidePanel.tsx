import type { ReactNode } from 'react';
import { Box, IconButton, Tab, Tabs } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { brand } from '../../theme';

/**
 * Right-hand panel with two tabs: Ask Bit and the AI preview. It sits in its own
 * grid column, so opening it pushes the page over instead of covering it. Both
 * tabs stay mounted while closed, so Bit's conversation is kept.
 */
export function SidePanel({
  tab,
  onTab,
  previewReady,
  bit,
  preview,
}: {
  tab: 'bit' | 'preview' | null;
  onTab: (t: 'bit' | 'preview' | null) => void;
  previewReady: boolean;
  bit: ReactNode;
  preview: ReactNode;
}) {
  return (
    <Box
      component="aside"
      aria-label="Side panel"
      sx={{
        display: tab ? 'flex' : 'none',
        flexDirection: 'column',
        minHeight: { xs: 460, md: 0 },
        minWidth: 0,
        overflow: 'hidden',
        bgcolor: '#fff',
        borderTop: { xs: `1px solid ${brand.border}`, md: 'none' },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          bgcolor: brand.strip,
          borderBottom: `1px solid ${brand.border}`,
          pr: 0.5,
        }}
      >
        <Tabs
          value={tab ?? false}
          onChange={(_, v: 'bit' | 'preview') => onTab(v)}
          aria-label="Side panel tabs"
          sx={{ flex: 1, minHeight: 44, '& .MuiTab-root': { minHeight: 44, textTransform: 'none', fontWeight: 700 } }}
        >
          <Tab value="bit" label="Ask Bit" />
          {previewReady && <Tab value="preview" label="AI preview" />}
        </Tabs>
        <IconButton size="small" aria-label="Close side panel" onClick={() => onTab(null)}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ display: tab === 'bit' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>{bit}</Box>
      <Box sx={{ display: tab === 'preview' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
        {preview}
      </Box>
    </Box>
  );
}
