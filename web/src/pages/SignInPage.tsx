import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Container, TextField, Typography } from '@mui/material';
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
    <Box sx={{ flex: 1 }}>
      <Box
        sx={{
          bgcolor: brand.tealDark,
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
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.14) 1.5px, transparent 1.5px)',
            backgroundSize: '22px 22px',
          }}
        />
        <Container
          maxWidth="lg"
          sx={{
            position: 'relative',
            py: { xs: 5, md: 7 },
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="overline" sx={{ color: brand.orange }}>
              CodeAI · Adaptive lessons
            </Typography>
            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: '2.4rem', md: '3.4rem' },
                mt: 1,
                mb: 2,
                maxWidth: 640,
              }}
            >
              Every student, their own path to the same goal
            </Typography>
            <Typography sx={{ fontSize: '1.1rem', opacity: 0.92, maxWidth: 560 }}>
              Lessons adapt to what each student shows, with an AI tutor beside them and a teacher view that shows who needs help.{' '}
              {users.length > 0 ? 'Pick a demo account to try it.' : 'Sign in to continue.'}
            </Typography>
          </Box>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <Bit size={180} />
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 5 }}>
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
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' },
              gap: 4,
            }}
          >
            <Box>
              <Typography variant="h2" sx={{ mb: 0.5 }}>
                I'm a student
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Ava and Ben start fresh. The others already have some progress.
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  gap: 1.5,
                }}
              >
                {students.map((u) => (
                  <AccountButton
                    key={u.id}
                    user={u}
                    accent={brand.teal}
                    note={FRESH.has(u.id) ? 'Starts fresh' : 'In progress'}
                    onSelect={choose}
                  />
                ))}
              </Box>
            </Box>
            <Box>
              <Typography variant="h2" sx={{ mb: 0.5 }}>
                I'm a teacher
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                See where every student is against the class bar.
              </Typography>
              <Box sx={{ display: 'grid', gap: 1.5 }}>
                {teachers.map((u) => (
                  <AccountButton
                    key={u.id}
                    user={u}
                    accent={brand.purple}
                    note="Period 3 · 7 students"
                    onSelect={choose}
                  />
                ))}
              </Box>
            </Box>
          </Box>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mt: 5 }}>
          {cognito
            ? 'Signed in with Amazon Cognito; your role comes from your group. Demo accounts are synthetic users with no real student data.'
            : "Demo sign-in with synthetic users. Production signs in with Amazon Cognito, and the role comes from the user's group."}
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
}: {
  user: SessionUser;
  accent: string;
  note: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onSelect(user.id)}
      sx={{
        all: 'unset',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.5,
        pl: 2,
        bgcolor: '#fff',
        borderRadius: 1.5,
        border: `1px solid ${brand.borderLight}`,
        borderLeft: `5px solid ${accent}`,
        transition: 'box-shadow 120ms, transform 120ms',
        '&:hover': {
          boxShadow: '0 4px 14px rgba(41,47,54,0.12)',
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
