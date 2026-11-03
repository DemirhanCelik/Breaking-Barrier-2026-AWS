import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import type { Role } from './api';
import { AppShell } from './components/AppShell';
import { useSession } from './session';
import { SignInPage } from './pages/SignInPage';
import { StudentLessonPage } from './pages/student/StudentLessonPage';
import { TeacherDashboardPage } from './pages/teacher/TeacherDashboardPage';
import { StudentTracePage } from './pages/teacher/StudentTracePage';

const homeFor = (role: Role) => (role === 'teacher' ? '/teacher' : '/student');

/**
 * Client-side guard for navigation only. Authorization of record is the API
 * (teacher endpoints return 403 to students), per design §11.
 */
function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useSession();
  if (loading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <CircularProgress aria-label="Loading" />
      </Box>
    );
  }
  if (!user) return <Navigate to="/signin" replace />;
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

function Home() {
  const { user, loading } = useSession();
  if (loading) return null;
  return <Navigate to={user ? homeFor(user.role) : '/signin'} replace />;
}

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route
          path="/student"
          element={
            <RequireRole role="student">
              <StudentLessonPage />
            </RequireRole>
          }
        />
        <Route
          path="/teacher"
          element={
            <RequireRole role="teacher">
              <TeacherDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/teacher/students/:studentId"
          element={
            <RequireRole role="teacher">
              <StudentTracePage />
            </RequireRole>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
