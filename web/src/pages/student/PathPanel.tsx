import { List, ListItem, ListItemIcon, ListItemText, Paper, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import type { PathItem } from '../../api';

/** Non-evaluative progress: step titles only, no stages, scores, or tier labels (FR13). */
export function PathPanel({ path, stepsCompleted }: { path: PathItem[]; stepsCompleted: number }) {
  return (
    <Paper sx={{ p: 2.5, position: { md: 'sticky' }, top: { md: 88 } }}>
      <Typography variant="h3">Your path</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {stepsCompleted === 0 ? 'Your first step is ready.' : `${stepsCompleted} step${stepsCompleted === 1 ? '' : 's'} done so far.`}{' '}
        Your path adjusts as you work.
      </Typography>
      <List dense disablePadding>
        {path.map((p) => (
          <ListItem key={p.levelId} disableGutters aria-current={p.status === 'current' ? 'step' : undefined}>
            <ListItemIcon sx={{ minWidth: 34 }}>
              {p.status === 'done' ? (
                <CheckCircleIcon color="primary" fontSize="small" titleAccess="Done" />
              ) : p.status === 'current' ? (
                <RadioButtonCheckedIcon color="secondary" fontSize="small" titleAccess="Current step" />
              ) : (
                <RadioButtonUncheckedIcon color="disabled" fontSize="small" titleAccess="Coming up" />
              )}
            </ListItemIcon>
            <ListItemText
              primary={p.title}
              slotProps={{
                primary: {
                  fontWeight: p.status === 'current' ? 700 : 400,
                  color: p.status === 'upcoming' ? 'text.secondary' : 'text.primary',
                },
              }}
            />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
}
