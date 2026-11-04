import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { api, type AdminDirectory, type Appointment } from '../../api';
import { brand } from '../../theme';
import { AdminHeader } from './AdminHeader';

/** Admin: pair teachers with students for a unit. No student-progress data. */
export function AppointmentsPage() {
  const [directory, setDirectory] = useState<AdminDirectory | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [teacherId, setTeacherId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    Promise.all([api.getAdminDirectory(), api.listAppointments()])
      .then(([dir, appts]) => {
        setDirectory(dir);
        setAppointments(appts.appointments);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const refreshAppointments = () =>
    api.listAppointments().then((a) => setAppointments(a.appointments)).catch((e: Error) => setMsg({ kind: 'error', text: e.message }));

  const create = async () => {
    if (!teacherId || !studentId || !unitId) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.createAppointment(teacherId, studentId, unitId);
      await refreshAppointments();
      setMsg({ kind: 'success', text: 'Appointment created.' });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a: Appointment) => {
    setMsg(null);
    try {
      await api.removeAppointment(a.teacherId, a.studentId, a.unitId);
      await refreshAppointments();
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    }
  };

  const unitName = (id: string) => directory?.units.find((u) => u.id === id)?.name ?? id;

  return (
    <Box sx={{ flex: 1 }}>
      <AdminHeader
        eyebrow="Administration"
        title="Appointments"
        subtitle="Pair a teacher with a student for a unit. This decides who supports whom."
      />
      <Container maxWidth="lg" sx={{ py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {error && (
          <Alert severity="error" action={<Button color="inherit" onClick={load}>Try again</Button>}>
            {error}
          </Alert>
        )}
        {loading && !directory ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
            <CircularProgress aria-label="Loading appointments" />
          </Box>
        ) : (
          <>
            <Box
              component="section"
              sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 2, p: 2.5 }}
            >
              <Typography variant="h2" sx={{ fontSize: '1.15rem', mb: 0.5 }}>
                Appoint a teacher to a student
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Choose the teacher who will support this student in the selected unit.
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mb: 2 }}>
                <TextField
                  select
                  label="Teacher"
                  size="small"
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                >
                  {directory?.teachers.map((t) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Student"
                  size="small"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                >
                  {directory?.students.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField select label="Unit" size="small" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                  {directory?.units.map((u) => (
                    <MenuItem key={u.id} value={u.id}>
                      {u.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <PersonAddAltOutlinedIcon />}
                  disabled={busy || !teacherId || !studentId || !unitId}
                  onClick={() => void create()}
                >
                  {busy ? 'Saving…' : 'Create appointment'}
                </Button>
                {msg && (
                  <Alert severity={msg.kind} sx={{ flex: 1, minWidth: 240, py: 0 }}>
                    {msg.text}
                  </Alert>
                )}
              </Box>
            </Box>

            <Box
              component="section"
              sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 2, p: 2.5 }}
            >
              <Typography variant="h2" sx={{ fontSize: '1.15rem', mb: 1.5 }}>
                Current appointments ({appointments.length})
              </Typography>
              {appointments.length === 0 ? (
                <Typography color="text.secondary">No appointments yet. Create one above.</Typography>
              ) : (
                <TableContainer>
                  <Table aria-label="Current appointments">
                    <TableHead>
                      <TableRow>
                        <TableCell>Teacher</TableCell>
                        <TableCell>Student</TableCell>
                        <TableCell>Unit</TableCell>
                        <TableCell align="right" />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {appointments.map((a) => (
                        <TableRow key={`${a.teacherId}-${a.studentId}-${a.unitId}`} hover>
                          <TableCell sx={{ fontWeight: 600 }}>{a.teacherName}</TableCell>
                          <TableCell>{a.studentName}</TableCell>
                          <TableCell>{unitName(a.unitId)}</TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              color="error"
                              startIcon={<DeleteOutlineIcon />}
                              onClick={() => void remove(a)}
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          </>
        )}
      </Container>
    </Box>
  );
}
