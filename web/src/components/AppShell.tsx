import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
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
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import TuneIcon from '@mui/icons-material/Tune';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { api, authMode, demoControls } from '../api';
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
  const { user } = useSession();
  // With Cognito the backend serves demo controls to teachers only.
  const controls = authMode === 'cognito' && user?.role !== 'teacher' ? null : demoControls;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [fault, setFault] = useState(false);
  const [routing, setRouting] = useState<{ mode: 'advised' | 'rules'; available: boolean } | null>(null);
  const [units, setUnits] = useState<{ current: string; units: { id: string; name: string }[] } | null>(null);
  const [switching, setSwitching] = useState(false);
  useEffect(() => {
    controls?.getFaultInjection().then(setFault).catch(() => setFault(false));
    controls?.getRoutingMode().then(setRouting).catch(() => setRouting(null));
    controls?.getUnits().then(setUnits).catch(() => setUnits(null));
  }, [controls]);
  if (!controls || user?.role !== 'teacher') return null;

  return (
    <>
      <Tooltip title="Courses and demo controls">
        <IconButton
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-label="Courses and demo controls"
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
            {api.mode === 'mock' ? 'Synthetic users and data, stored in this browser.' : 'Synthetic users and data on the demo backend.'}
          </Typography>
        </Box>
        <Divider />
        <Box sx={{ px: 2, py: 1 }}>
          <FormControlLabel
            control={
              <Switch
                color="warning"
                checked={fault}
                onChange={async (e) => {
                  const on = e.target.checked;
                  setFault(on);
                  try {
                    await controls.setFaultInjection(on);
                  } catch {
                    setFault(!on);
                  }
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
        <Box sx={{ px: 2, py: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={routing?.mode === 'advised'}
                disabled={!routing?.available}
                onChange={async (e) => {
                  const mode = e.target.checked ? 'advised' : 'rules';
                  const prev = routing;
                  setRouting((r) => (r ? { ...r, mode } : r));
                  try {
                    await controls.setRoutingMode(mode);
                  } catch {
                    setRouting(prev);
                  }
                }}
              />
            }
            label="AI-advised routing"
          />
          <Typography variant="caption" color="text.secondary" display="block">
            {routing?.available
              ? 'On: AI picks the next level from the levels the rules allow. Off: rules only.'
              : 'Needs the API with Bedrock. Routing here is rules only.'}
          </Typography>
        </Box>
        <Divider />
        {units && units.units.length > 1 && (
          <>
            <Box sx={{ px: 2, pt: 1, pb: 0.5 }}>
              <Typography variant="overline" color="text.secondary">
                Courses and units
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Changing the class assignment preserves saved progress.
              </Typography>
            </Box>
            {units.units.map((u) => (
              <MenuItem
                key={u.id}
                selected={u.id === units.current}
                disabled={switching}
                onClick={async () => {
                  if (u.id === units.current) return;
                  setSwitching(true);
                  try {
                    await controls.setUnit(u.id);
                    window.location.reload();
                  } catch {
                    setSwitching(false);
                    window.alert('Could not switch units. Please try again.');
                  }
                }}
              >
                {u.id === units.current ? '● ' : ''}
                {u.name}
              </MenuItem>
            ))}
            <Divider />
          </>
        )}
        <MenuItem
          onClick={async () => {
            await controls.resetDemo().catch(() => undefined);
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
  const { pathname } = useLocation();
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
            height: 76,
            flexShrink: 0,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            px: { xs: 1.5, md: 2.5 },
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 1, sm: 2 },
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
          {user?.role === 'student' && <Button component={RouterLink} to="/student" startIcon={pathname === '/student/lesson' ? <ArrowBackRoundedIcon /> : undefined} sx={{ color: '#d5e5df', whiteSpace: 'nowrap', minWidth: 0, fontSize: 13 }}>{pathname === '/student/lesson' ? 'My learning' : 'Learning home'}</Button>}
          {!user && <Typography variant="body2" sx={{ color: '#b5cec5', display: { xs: 'none', sm: 'block' }, ml: 2 }}>Learn • Create • Practice</Typography>}
          {user?.role === 'teacher' && (
            <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontWeight: 600, display: { xs: 'none', md: 'block' } }}>
              Teacher workspace
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
