import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Switch,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import { api, demoControls } from '../api';
import { useSession } from '../session';

function DemoMenu() {
  const controls = demoControls;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [fault, setFault] = useState(() => controls?.getFaultInjection() ?? false);
  if (!controls) return null;

  return (
    <>
      <Tooltip title="Demo controls">
        <IconButton color="inherit" onClick={(e) => setAnchor(e.currentTarget)} aria-label="Demo controls">
          <ScienceOutlinedIcon />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <Box sx={{ px: 2, py: 1, maxWidth: 320 }}>
          <Typography variant="subtitle2">Demo controls (mock API)</Typography>
          <Typography variant="body2" color="text.secondary">
            All users and data are synthetic and stored in this browser.
          </Typography>
        </Box>
        <Divider />
        <Box sx={{ px: 2, py: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={fault}
                onChange={(e) => {
                  controls.setFaultInjection(e.target.checked);
                  setFault(e.target.checked);
                }}
              />
            }
            label="Simulate validation failure"
          />
          <Typography variant="caption" color="text.secondary" display="block">
            The next submission moves the student to the non-adaptive path (FR10).
          </Typography>
        </Box>
        <Divider />
        <MenuItem
          onClick={() => {
            controls.resetDemo();
            window.location.reload();
          }}
        >
          Reset demo data
        </MenuItem>
      </Menu>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useSession();
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky" color="primary">
        <Toolbar sx={{ gap: 1.5 }}>
          <Typography variant="h6" component="div" sx={{ fontWeight: 700 }}>
            CodeAI
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.85, display: { xs: 'none', sm: 'block' } }}>
            Adaptive Lesson
          </Typography>
          {api.mode === 'mock' && (
            <Chip size="small" label="Demo data" sx={{ bgcolor: 'rgba(255,255,255,0.18)', color: 'inherit' }} />
          )}
          <Box sx={{ flex: 1 }} />
          <DemoMenu />
          {user && (
            <>
              <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>
                {user.displayName}
              </Typography>
              <Button
                color="inherit"
                onClick={async () => {
                  await signOut();
                  navigate('/signin');
                }}
              >
                Sign out
              </Button>
            </>
          )}
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="lg" sx={{ py: 4, flex: 1 }}>
        {children}
      </Container>
    </Box>
  );
}
