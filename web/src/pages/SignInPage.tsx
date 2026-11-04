import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Container, Tab, Tabs, TextField, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { api, authMode, type SessionUser } from '../api';
import { cognitoConfigured } from '../auth/cognito';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../auth/demoAccounts';
import { Bit, Initials } from '../components/brand';
import { useSession } from '../session';
import { brand } from '../theme';

const FRESH = new Set(['s-ava', 's-ben']);

export function SignInPage() {
  const { user, signIn, signInWithPassword } = useSession();
  const navigate = useNavigate();
  const cognito = authMode === 'cognito';
  const [users, setUsers] = useState<SessionUser[]>(cognito && DEMO_PASSWORD ? DEMO_ACCOUNTS : []);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(cognito);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (cognito) return;
    api
      .listDemoUsers()
      .then(setUsers)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoaded(true));
  }, [cognito]);

  if (user) return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />;

  if (!cognito && api.mode === 'http' && loaded && users.length === 0 && !error) {
    return (
      <Container sx={{ py: 6 }}>
        <Alert severity="info">
          No demo accounts on this backend. Sign-in needs AUTH_MODE=demo, or build the app with VITE_AUTH_MODE=cognito.
        </Alert>
      </Container>
    );
  }

  const go = (u: SessionUser) => navigate(u.role === 'teacher' ? '/teacher' : '/student');

  const run = async (fn: () => Promise<SessionUser>) => {
    setBusy(true);
    setError(null);
    try {
      go(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const choose = (id: string) => {
    if (busy) return;
    if (!cognito) return void run(() => signIn(id));
    const account = DEMO_ACCOUNTS.find((a) => a.id === id);
    if (account) void run(() => signInWithPassword(account.email, DEMO_PASSWORD));
  };

  const teachers = users.filter((u) => u.role === 'teacher');
  const students = users.filter((u) => u.role === 'student');

  return (
    <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 0.85fr) minmax(0, 1fr)' } }}>
      <Box
        sx={{
          bgcolor: brand.charcoal,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(ellipse at 10% 90%, rgba(33,182,168,0.18), transparent 65%), radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '100% 100%, 24px 24px',
          }}
        />
        <Container
          maxWidth="lg"
          sx={{
            position: 'relative',
            py: { xs: 3, md: 8 },
            px: { xs: 3, md: 6, xl: 8 },
            flexDirection: 'column',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="overline" sx={{ color: brand.orange }}>
              BREAKING BARRIERS 2026 · CODEAI
            </Typography>
            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: '2.2rem', md: '3.8rem', xl: '4.4rem' },
                mt: 1,
                mb: 2,
                maxWidth: 640,
              }}
            >
              Big ideas.
              Your own way there.
            </Typography>
            <Typography sx={{ fontSize: '1.1rem', opacity: 0.92, maxWidth: 560 }}>
              Learn to code. Create with AI. Build something that feels like you, with a little guidance whenever you need it.
            </Typography>
          </Box>
          <Box sx={{ display: { xs: 'none', lg: 'block' }, width: '100%', mt: 2, p: 3, border: '1px solid #42605c', borderRadius: 4, bgcolor: 'rgba(255,255,255,0.04)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <Bit size={52} />
              <Box><Typography fontWeight={700}>Meet Bit, your learning sidekick</Typography><Typography variant="body2" sx={{ color: '#bdd4ce' }}>A nudge when you need it. Space to figure it out.</Typography></Box>
            </Box>
            {['Choose a topic you care about', 'Find your starting point', 'Make, try, and grow at your pace'].map((text, i) => (
              <Box key={text} sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
                <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: '#314d48', color: '#9fe1c9', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>{i + 1}</Box>
                <Typography variant="body2" sx={{ color: '#e1eee8' }}>{text}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 }, px: { xs: 3, md: 5, xl: 7 }, alignSelf: 'center' }}>
        <Typography variant="overline" color="primary">YOUR NEXT CHAPTER</Typography>
        <Typography variant="h2" sx={{ mt: 1, mb: 1, fontSize: { xs: '2rem', md: '2.5rem' } }}>Welcome to your learning studio.</Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>{users.length > 0 ? 'Try the student experience or explore the teacher workspace.' : 'Welcome back. Sign in to keep building.'}</Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {cognito && (
          <Box
            component="form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void run(() => signInWithPassword(email, password));
            }}
            sx={{
              maxWidth: 420,
              mb: users.length > 0 ? 5 : 0,
              display: 'grid',
              gap: 2,
            }}
          >
            <Typography variant="h2">Sign in</Typography>
            {!cognitoConfigured && <Alert severity="warning">Cognito is not configured for this build.</Alert>}
            <TextField
              label="Email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" variant="contained" size="large" disabled={busy || !cognitoConfigured}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </Box>
        )}

        {users.length > 0 && (
          <Box>
            <Tabs value={role} onChange={(_, value: 'student' | 'teacher') => setRole(value)} aria-label="Choose your demo experience" sx={{ mb: 3, borderBottom: `1px solid ${brand.borderLight}` }}>
              <Tab value="student" label="Student experience" sx={{ textTransform: 'none', fontWeight: 700 }} />
              <Tab value="teacher" label="Teacher workspace" sx={{ textTransform: 'none', fontWeight: 700 }} />
            </Tabs>
            <Typography variant="h2" sx={{ mb: 1 }}>{role === 'student' ? 'Start with a learner’s perspective.' : 'See the whole class. Know who needs you.'}</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>{role === 'student' ? 'Choose a learner. Their home shows where to begin or resume.' : 'Explore progress, understand each learning path, and plan focused support.'}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: role === 'student' ? '1fr 1fr' : '1fr' }, gap: 1.5 }}>
              {(role === 'student' ? students.filter((u) => showAllStudents || FRESH.has(u.id)) : teachers).map((u) => <AccountButton key={u.id} user={u} accent={role === 'student' ? brand.teal : brand.purple} note={role === 'teacher' ? 'Explore the class overview' : 'Open learning home'} onSelect={choose} disabled={busy} />)}
            </Box>
            {role === 'student' && students.some((u) => !FRESH.has(u.id)) && <Button onClick={() => setShowAllStudents((shown) => !shown)} aria-expanded={showAllStudents} sx={{ mt: 2, px: 0 }}>{showAllStudents ? 'Show fewer demo profiles' : 'Explore more demo learners'}</Button>}
            <Box sx={{ mt: 4, p: 2.5, bgcolor: '#eaf0e6', borderRadius: 2 }}><Typography variant="body2" fontWeight={700}>{role === 'student' ? 'What happens next?' : 'Built around the moments that matter.'}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{role === 'student' ? 'Visit your learning home, find your starting point, then work through a path that adapts as you learn.' : 'Start with students who may need a check-in, then review the evidence behind their learning paths.'}</Typography></Box>
          </Box>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mt: 4, pt: 3, borderTop: `1px solid ${brand.borderLight}`, fontSize: 12 }}>
          {cognito
            ? 'Demo profiles use synthetic data. No real student information.'
            : 'Hackathon demo · Synthetic profiles · No real student data'}
        </Typography>
      </Container>
    </Box>
  );
}

function AccountButton({
  user,
  accent,
  note,
  onSelect,
  disabled,
}: {
  user: SessionUser;
  accent: string;
  note: string;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      onClick={() => onSelect(user.id)}
      sx={{
        all: 'unset',
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.5,
        pl: 2,
        bgcolor: '#fff',
        borderRadius: 1.5,
        border: `1px solid ${brand.borderLight}`,

        transition: 'box-shadow 120ms, transform 120ms',
        '&:hover': {
          borderColor: accent,
          boxShadow: '0 6px 20px rgba(24,46,48,0.06)',
          transform: 'translateY(-1px)',
        },
        '&:hover .go': { color: accent },
        '&:focus-visible': {
          outline: `3px solid ${brand.orange}`,
          outlineOffset: 2,
        },
      }}
    >
      <Initials name={user.displayName} size={40} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700 }}>{user.displayName.replace(/\s*\(.*\)/, '')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {note}
        </Typography>
      </Box>
      <ArrowForwardIcon className="go" sx={{ color: brand.border }} />
    </Box>
  );
}
