import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Alert, Box, Container, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { api, type SessionUser } from '../api';
import { Bit, Initials } from '../components/brand';
import { useSession } from '../session';
import { brand } from '../theme';

const FRESH = new Set(['s-ava', 's-ben']);

export function SignInPage() {
  const { user, signIn } = useSession();
  const navigate = useNavigate();
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listDemoUsers().then(setUsers).catch((e: Error) => setError(e.message));
  }, []);

  if (user) return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />;

  if (api.mode === 'http') {
    return (
      <Container sx={{ py: 6 }}>
        <Alert severity="info">Sign-in uses Amazon Cognito in this environment. Cognito is not wired up in the frontend yet.</Alert>
      </Container>
    );
  }

  const choose = async (id: string) => {
    try {
      const u = await signIn(id);
      navigate(u.role === 'teacher' ? '/teacher' : '/student');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const teachers = users.filter((u) => u.role === 'teacher');
  const students = users.filter((u) => u.role === 'student');

  return (
    <Box sx={{ flex: 1 }}>
      <Box sx={{ bgcolor: brand.tealDark, color: '#fff', position: 'relative', overflow: 'hidden' }}>
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.14) 1.5px, transparent 1.5px)',
            backgroundSize: '22px 22px',
          }}
        />
        <Container maxWidth="lg" sx={{ position: 'relative', py: { xs: 5, md: 7 }, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="overline" sx={{ color: brand.orange }}>
              Hour of AI · Adaptive lesson demo
            </Typography>
            <Typography variant="h1" sx={{ fontSize: { xs: '2.4rem', md: '3.4rem' }, mt: 1, mb: 2, maxWidth: 640 }}>
              Build a club webpage by directing an AI
            </Typography>
            <Typography sx={{ fontSize: '1.1rem', opacity: 0.92, maxWidth: 560 }}>
              Every student starts where they are and gets their own path to the same goal. Pick a demo account to
              try it.
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

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 4 }}>
          <Box>
            <Typography variant="h2" sx={{ mb: 0.5 }}>
              I'm a student
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Ava and Ben start fresh. The others already have some progress.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              {students.map((u) => (
                <AccountButton key={u.id} user={u} accent={brand.teal} note={FRESH.has(u.id) ? 'Starts fresh' : 'In progress'} onSelect={choose} />
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
                <AccountButton key={u.id} user={u} accent={brand.purple} note="Period 3 · 7 students" onSelect={choose} />
              ))}
            </Box>
          </Box>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 5 }}>
          Demo sign-in with synthetic users. Production signs in with Amazon Cognito, and the role comes from the user's
          group.
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
        '&:hover': { boxShadow: '0 4px 14px rgba(41,47,54,0.12)', transform: 'translateY(-1px)' },
        '&:hover .go': { color: accent },
        '&:focus-visible': { outline: `3px solid ${brand.orange}`, outlineOffset: 2 },
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
