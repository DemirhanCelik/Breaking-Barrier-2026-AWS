import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Divider,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { api, demoControls } from '../api';
import { useSession } from '../session';
import { brand } from '../theme';
import { Initials, Logo } from './brand';

const HeaderSlotContext = createContext<(node: ReactNode) => void>(() => {});

/**
 * Lets a page place content (e.g. lesson progress) in the center of the top bar.
 * `key` controls when the slot is refreshed, so a new element each render
 * doesn't cause a render loop.
 */
export function useHeaderSlot(node: ReactNode, key: string) {
  const set = useContext(HeaderSlotContext);
  useEffect(() => {
    set(node);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, key]);
  useEffect(() => () => set(null), [set]);
}

function DemoMenu() {
  const controls = demoControls;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [fault, setFault] = useState(() => controls?.getFaultInjection() ?? false);
  if (!controls) return null;

  return (
    <>
      <Tooltip title="Demo controls">
        <IconButton
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-label="Demo controls"
          sx={{ color: fault ? brand.orange : 'rgba(255,255,255,0.8)' }}
        >
          <TuneIcon />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <Box sx={{ px: 2, py: 1, maxWidth: 320 }}>
          <Typography variant="overline" color="text.secondary">
            Demo controls
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Synthetic users and data, stored in this browser.
          </Typography>
        </Box>
        <Divider />
        <Box sx={{ px: 2, py: 1 }}>
          <FormControlLabel
            control={
              <Switch
                color="warning"
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
            The next submission moves the student to the non-adaptive path.
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

function UserMenu() {
  const { user, signOut } = useSession();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!user) return null;
  return (
    <>
      <Button
        onClick={(e) => setAnchor(e.currentTarget)}
        endIcon={<KeyboardArrowDownIcon />}
        sx={{ color: '#fff', px: 1, gap: 0.5 }}
        aria-label="Account menu"
      >
        <Initials name={user.displayName} size={30} />
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, ml: 0.5, fontWeight: 600 }}>
          {user.displayName.replace(/\s*\(.*\)/, '')}
        </Box>
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <Box sx={{ px: 2, py: 1 }}>
          <Typography fontWeight={700}>{user.displayName}</Typography>
          <Typography variant="body2" color="text.secondary">
            {user.role === 'teacher' ? 'Teacher' : 'Student'}
          </Typography>
        </Box>
        <Divider />
        <MenuItem
          onClick={async () => {
            setAnchor(null);
            await signOut();
            navigate('/signin');
          }}
        >
          Sign out
        </MenuItem>
      </Menu>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [slot, setSlot] = useState<ReactNode>(null);

  return (
    <HeaderSlotContext.Provider value={setSlot}>
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Box
          component="header"
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: (t) => t.zIndex.appBar,
            height: 60,
            px: { xs: 1.5, md: 2.5 },
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            bgcolor: brand.charcoal,
            color: '#fff',
          }}
        >
          <Box
            component={RouterLink}
            to="/"
            sx={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}
            aria-label="CodeAI home"
          >
            <Logo />
          </Box>
          {user?.role === 'teacher' && (
            <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontWeight: 600, display: { xs: 'none', md: 'block' } }}>
              Teacher Home
            </Typography>
          )}
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>{slot}</Box>
          {api.mode === 'mock' && (
            <Typography
              variant="caption"
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: 1,
                border: '1px solid rgba(255,255,255,0.3)',
                color: 'rgba(255,255,255,0.8)',
                fontWeight: 600,
                display: { xs: 'none', sm: 'block' },
              }}
            >
              DEMO
            </Typography>
          )}
          <DemoMenu />
          <UserMenu />
        </Box>
        <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {children}
        </Box>
      </Box>
    </HeaderSlotContext.Provider>
  );
}
