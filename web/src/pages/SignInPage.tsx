import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import { api, type SessionUser } from '../api';
import { useSession } from '../session';

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
      <Alert severity="info">
        Sign-in uses Amazon Cognito in this environment. Cognito is not wired up in the frontend yet.
      </Alert>
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
    <Stack spacing={3}>
      <Box>
        <Typography variant="h1" gutterBottom>
          Choose a demo user
        </Typography>
        <Typography color="text.secondary">
          Demo sign-in with synthetic users. In production this is replaced by Amazon Cognito, with the role coming
          from the user's group.
        </Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}

      <Box>
        <Typography variant="h3" gutterBottom>
          Teacher
        </Typography>
        <Grid container spacing={2}>
          {teachers.map((u) => (
            <Grid key={u.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <UserCard user={u} icon={<SchoolOutlinedIcon color="secondary" />} onSelect={choose} />
            </Grid>
          ))}
        </Grid>
      </Box>

      <Box>
        <Typography variant="h3" gutterBottom>
          Students
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Ava and Ben start fresh. The others have seeded progress so the teacher view has something to show.
        </Typography>
        <Grid container spacing={2}>
          {students.map((u) => (
            <Grid key={u.id} size={{ xs: 12, sm: 6, md: 3 }}>
              <UserCard user={u} icon={<PersonOutlineIcon color="primary" />} onSelect={choose} />
            </Grid>
          ))}
        </Grid>
      </Box>
    </Stack>
  );
}

function UserCard({
  user,
  icon,
  onSelect,
}: {
  user: SessionUser;
  icon: React.ReactNode;
  onSelect: (id: string) => void;
}) {
  return (
    <Card>
      <CardActionArea onClick={() => onSelect(user.id)}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {icon}
          <Typography fontWeight={600}>{user.displayName}</Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
