import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  IconButton,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
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

            <AppointmentTree appointments={appointments} unitName={unitName} onRemove={remove} />
          </>
        )}
      </Container>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Tree view: Course -> Teacher -> Students. Makes the mapping scannable instead
// of a flat row-per-pairing table.
// ---------------------------------------------------------------------------

interface TeacherNode {
  teacherId: string;
  teacherName: string;
  students: Appointment[];
}
interface CourseNode {
  unitId: string;
  teachers: TeacherNode[];
  studentCount: number;
}

function groupByCourse(appointments: Appointment[]): CourseNode[] {
  const courses = new Map<string, Map<string, TeacherNode>>();
  for (const a of appointments) {
    if (!courses.has(a.unitId)) courses.set(a.unitId, new Map());
    const teachers = courses.get(a.unitId)!;
    if (!teachers.has(a.teacherId)) {
      teachers.set(a.teacherId, { teacherId: a.teacherId, teacherName: a.teacherName, students: [] });
    }
    teachers.get(a.teacherId)!.students.push(a);
  }
  return [...courses.entries()].map(([unitId, teachers]) => {
    const teacherNodes = [...teachers.values()].sort((x, y) => x.teacherName.localeCompare(y.teacherName));
    teacherNodes.forEach((t) => t.students.sort((x, y) => x.studentName.localeCompare(y.studentName)));
    return {
      unitId,
      teachers: teacherNodes,
      studentCount: teacherNodes.reduce((n, t) => n + t.students.length, 0),
    };
  });
}

function AppointmentTree({
  appointments,
  unitName,
  onRemove,
}: {
  appointments: Appointment[];
  unitName: (id: string) => string;
  onRemove: (a: Appointment) => void;
}) {
  const courses = useMemo(() => groupByCourse(appointments), [appointments]);
  const [view, setView] = useState<'tree' | 'list'>('tree');

  return (
    <Box component="section" sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 2, p: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
        <Typography variant="h2" sx={{ fontSize: '1.15rem' }}>
          Current mapping ({appointments.length})
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={view}
          onChange={(_, v: 'tree' | 'list' | null) => v && setView(v)}
          aria-label="View mode"
        >
          <ToggleButton value="tree" sx={{ textTransform: 'none' }}>
            Tree
          </ToggleButton>
          <ToggleButton value="list" sx={{ textTransform: 'none' }}>
            Flat list
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {appointments.length === 0 ? (
        <Typography color="text.secondary">No appointments yet. Create one above.</Typography>
      ) : view === 'list' ? (
        <FlatList appointments={appointments} unitName={unitName} onRemove={onRemove} />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {courses.map((c) => (
            <CourseBranch key={c.unitId} course={c} courseName={unitName(c.unitId)} onRemove={onRemove} />
          ))}
        </Box>
      )}
    </Box>
  );
}

function CourseBranch({
  course,
  courseName,
  onRemove,
}: {
  course: CourseNode;
  courseName: string;
  onRemove: (a: Appointment) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Box sx={{ border: `1px solid ${brand.borderLight}`, borderRadius: 2, overflow: 'hidden' }}>
      <Box
        onClick={() => setOpen((o) => !o)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 1.25,
          bgcolor: brand.bg,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        <MenuBookOutlinedIcon fontSize="small" sx={{ color: brand.tealDark }} />
        <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 0 }}>{courseName}</Typography>
        <Chip size="small" variant="outlined" label={`${course.teachers.length} teacher${course.teachers.length === 1 ? '' : 's'}`} />
        <Chip size="small" variant="outlined" label={`${course.studentCount} student${course.studentCount === 1 ? '' : 's'}`} />
      </Box>
      <Collapse in={open}>
        <Box sx={{ pl: 3, pr: 1.5, py: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {course.teachers.map((t) => (
            <TeacherBranch key={t.teacherId} teacher={t} onRemove={onRemove} />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

function TeacherBranch({ teacher, onRemove }: { teacher: TeacherNode; onRemove: (a: Appointment) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <Box sx={{ borderLeft: `2px solid ${brand.borderLight}`, pl: 1.5, py: 0.5 }}>
      <Box
        onClick={() => setOpen((o) => !o)}
        sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', userSelect: 'none', py: 0.5 }}
      >
        {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        <SchoolOutlinedIcon fontSize="small" sx={{ color: brand.purple }} />
        <Typography sx={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{teacher.teacherName}</Typography>
        <Chip size="small" label={`${teacher.students.length}`} sx={{ height: 20 }} />
      </Box>
      <Collapse in={open}>
        <Box sx={{ pl: 3.5, py: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {teacher.students.map((a) => (
            <Chip
              key={a.studentId}
              icon={<PersonOutlineIcon />}
              label={a.studentName}
              onDelete={() => onRemove(a)}
              deleteIcon={
                <Tooltip title="Remove this student from this teacher for this course">
                  <DeleteOutlineIcon />
                </Tooltip>
              }
              variant="outlined"
              sx={{ bgcolor: '#fff' }}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

function FlatList({
  appointments,
  unitName,
  onRemove,
}: {
  appointments: Appointment[];
  unitName: (id: string) => string;
  onRemove: (a: Appointment) => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {appointments.map((a) => (
        <Box
          key={`${a.teacherId}-${a.studentId}-${a.unitId}`}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            py: 1,
            borderBottom: `1px solid ${brand.borderLight}`,
            '&:last-of-type': { borderBottom: 'none' },
          }}
        >
          <SchoolOutlinedIcon fontSize="small" sx={{ color: brand.purple }} />
          <Typography sx={{ fontWeight: 600, minWidth: 140 }}>{a.teacherName}</Typography>
          <PersonOutlineIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          <Typography sx={{ flex: 1, minWidth: 120 }}>{a.studentName}</Typography>
          <Chip size="small" variant="outlined" label={unitName(a.unitId)} />
          <IconButton size="small" color="error" aria-label="Remove appointment" onClick={() => onRemove(a)}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
    </Box>
  );
}
