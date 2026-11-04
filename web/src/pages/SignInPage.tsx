import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Container, Tab, Tabs, TextField, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { api, authMode, type Role, type SessionUser } from '../api';
import { cognitoConfigured } from '../auth/cognito';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../auth/demoAccounts';
import { Initials } from '../components/brand';
import { useSession } from '../session';
import { brand } from '../theme';

const FRESH = new Set(['s-ava', 's-ben']);

const homeFor = (role: Role) => (role === 'teacher' ? '/teacher' : role === 'admin' ? '/admin' : '/student');

export function SignInPage() {
  const { user, signIn, signInWithPassword } = useSession();
  const navigate = useNavigate();
  const cognito = authMode === 'cognito';
  const [users, setUsers] = useState<SessionUser[]>(cognito && DEMO_PASSWORD ? DEMO_ACCOUNTS : []);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(cognito);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<'student' | 'teacher' | 'admin'>('student');
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

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  if (!cognito && api.mode === 'http' && loaded && users.length === 0 && !error) {
    return (
      <Container sx={{ py: 6 }}>
        <Alert severity="info">
          No demo accounts on this backend. Sign-in needs AUTH_MODE=demo, or build the app with VITE_AUTH_MODE=cognito.
        </Alert>
      </Container>
    );
  }

  const go = (u: SessionUser) => navigate(homeFor(u.role));

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
  const admins = users.filter((u) => u.role === 'admin');

  return (
    <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr' } }}>
      <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 }, px: { xs: 3, md: 5, xl: 7 }, alignSelf: 'center' }}>
        <Typography variant="overline" color="primary">CODEAI</Typography>
        <Typography variant="h2" sx={{ mt: 1, mb: 1, fontSize: { xs: '2rem', md: '2.5rem' } }}>Sign in to CodeAI</Typography>
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
            <Tabs value={role} onChange={(_, value: 'student' | 'teacher' | 'admin') => setRole(value)} aria-label="Choose your demo experience" sx={{ mb: 3, borderBottom: `1px solid ${brand.borderLight}` }}>
              <Tab value="student" label="Student experience" sx={{ textTransform: 'none', fontWeight: 700 }} />
              <Tab value="teacher" label="Teacher workspace" sx={{ textTransform: 'none', fontWeight: 700 }} />
              {admins.length > 0 && <Tab value="admin" label="Admin workspace" sx={{ textTransform: 'none', fontWeight: 700 }} />}
            </Tabs>
            <Typography variant="h2" sx={{ mb: 1 }}>{role === 'student' ? 'Start with a learner’s perspective.' : role === 'admin' ? 'Set up people and curriculum.' : 'See the whole class. Know who needs you.'}</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>{role === 'student' ? 'Choose a learner. Their home shows where to begin or resume.' : role === 'admin' ? 'Appoint teachers, review AI drafts, and manage the curriculum matrix.' : 'Explore progress, understand each learning path, and plan focused support.'}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: role === 'student' ? '1fr 1fr' : '1fr' }, gap: 1.5 }}>
              {(role === 'student' ? students.filter((u) => showAllStudents || FRESH.has(u.id)) : role === 'admin' ? admins : teachers).map((u) => <AccountButton key={u.id} user={u} accent={role === 'student' ? brand.teal : role === 'admin' ? brand.orange : brand.purple} note={role === 'teacher' ? 'Explore the class overview' : role === 'admin' ? 'Open the admin workspace' : 'Open learning home'} onSelect={choose} disabled={busy} />)}
            </Box>
            {role === 'student' && students.some((u) => !FRESH.has(u.id)) && <Button onClick={() => setShowAllStudents((shown) => !shown)} aria-expanded={showAllStudents} sx={{ mt: 2, px: 0 }}>{showAllStudents ? 'Show fewer demo profiles' : 'Explore more demo learners'}</Button>}
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
