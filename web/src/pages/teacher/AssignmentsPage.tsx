import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AddTaskOutlinedIcon from '@mui/icons-material/AddTaskOutlined';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import {
  api,
  type AssignableUnit,
  type Assignment,
  type AssignmentScope,
  type AssignmentTargetKind,
  type RosterStudent,
} from '../../api';
import type { CreateAssignmentBody } from '../../api/client';
import { brand } from '../../theme';
import { HeaderStat, TeacherHeader } from './TeacherHeader';

/**
 * Teacher assignments. Assigning prioritizes a unit/level in the student's
 * adaptive path (it does not force a fixed order). The create flow is a guided
 * two-step: who it's for, then what to assign — using name/title pickers, never
 * raw ids.
 */
export function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [units, setUnits] = useState<AssignableUnit[]>([]);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    api
      .listAssignments()
      .then((r) => {
        setAssignments(r.assignments);
        setUnits(r.units);
        setStudents(r.students);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const active = assignments.filter((a) => a.status === 'active');
  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? id;
  const studentName = (id?: string) => (id ? (students.find((s) => s.id === id)?.name ?? id) : '');

  const archive = async (id: string) => {
    try {
      const updated = await api.archiveAssignment(id);
      setAssignments((xs) => xs.map((a) => (a.id === id ? updated : a)));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Box sx={{ flex: 1 }}>
      <TeacherHeader
        eyebrow="Curriculum"
        title="Assignments"
        subtitle="Point students at a unit or a specific step. Assignments guide the adaptive path — they prioritize, they don't lock the order."
        right={
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <HeaderStat label="active" value={active.length} />
            <HeaderStat label="students" value={students.length} />
          </Box>
        }
      />
      <Container maxWidth="lg" sx={{ py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {error && (
          <Alert severity="error" action={<Button color="inherit" onClick={load}>Try again</Button>}>
            {error}
          </Alert>
        )}
        {loading && assignments.length === 0 && units.length === 0 ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
            <CircularProgress aria-label="Loading assignments" />
          </Box>
        ) : (
          <>
            <CreateForm
              units={units}
              students={students}
              onCreated={(a) => setAssignments((xs) => [a, ...xs])}
            />
            <AssignmentTable
              assignments={assignments}
              unitName={unitName}
              studentName={studentName}
              onArchive={archive}
            />
          </>
        )}
      </Container>
    </Box>
  );
}

/** Guided create flow: who → what → confirm. */
function CreateForm({
  units,
  students,
  onCreated,
}: {
  units: AssignableUnit[];
  students: RosterStudent[];
  onCreated: (a: Assignment) => void;
}) {
  const [scope, setScope] = useState<AssignmentScope>('class');
  const [targetKind, setTargetKind] = useState<AssignmentTargetKind>('unit');
  const [unitId, setUnitId] = useState('');
  const [levelCode, setLevelCode] = useState('');
  const [studentId, setStudentId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Default to the first unit once loaded.
  useEffect(() => {
    if (!unitId && units.length) setUnitId(units[0].id);
  }, [units, unitId]);

  const unit = units.find((u) => u.id === unitId);
  const levels = useMemo(() => unit?.levels ?? [], [unit]);
  const level = levels.find((l) => l.code === levelCode);
  const studentLabel = students.find((s) => s.id === studentId)?.name;

  const disabled =
    busy || !unitId || (scope === 'student' && !studentId) || (targetKind === 'level' && !levelCode);

  // Plain-language preview of the assignment.
  const summary =
    !unitId || (scope === 'student' && !studentId) || (targetKind === 'level' && !levelCode)
      ? null
      : `${scope === 'class' ? 'Everyone in your class' : (studentLabel ?? 'This student')} will be guided toward ${
          targetKind === 'unit' ? `the “${unit?.name}” unit` : `step ${level?.code} · ${level?.title}`
        }.`;

  const create = async () => {
    if (disabled) return;
    setBusy(true);
    setMsg(null);
    try {
      const body: CreateAssignmentBody = {
        scope,
        targetKind,
        unitId,
        ...(scope === 'student' && studentId ? { studentId } : {}),
        ...(targetKind === 'level' && levelCode ? { levelCode } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      const created = await api.createAssignment(body);
      onCreated(created);
      setMsg({ kind: 'success', text: 'Assignment created and prioritized for the student path.' });
      setNote('');
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box component="section" sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 2, p: 3 }}>
      <Typography variant="h2" sx={{ fontSize: '1.2rem', mb: 2.5 }}>
        New assignment
      </Typography>

      {units.length === 0 ? (
        <Alert severity="info">No assignable units are available right now.</Alert>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Step 1 — who */}
          <Box>
            <StepLabel n={1} text="Who is this for?" />
            <ToggleButtonGroup
              exclusive
              value={scope}
              onChange={(_, v: AssignmentScope | null) => v && setScope(v)}
              size="small"
              sx={{ mb: scope === 'student' ? 2 : 0 }}
            >
              <ToggleButton value="class" sx={{ textTransform: 'none', gap: 0.75, px: 2 }}>
                <GroupsOutlinedIcon fontSize="small" /> Whole class
              </ToggleButton>
              <ToggleButton value="student" sx={{ textTransform: 'none', gap: 0.75, px: 2 }}>
                <PersonOutlineIcon fontSize="small" /> One student
              </ToggleButton>
            </ToggleButtonGroup>
            {scope === 'student' && (
              <TextField
                select
                label="Student"
                size="small"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                sx={{ minWidth: 260, display: 'block' }}
                helperText={students.length === 0 ? 'No students are appointed to you for this unit yet.' : 'Your students for this unit.'}
              >
                {students.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Box>

          <Divider />

          {/* Step 2 — what */}
          <Box>
            <StepLabel n={2} text="What should they work on?" />
            <ToggleButtonGroup
              exclusive
              value={targetKind}
              onChange={(_, v: AssignmentTargetKind | null) => v && setTargetKind(v)}
              size="small"
              sx={{ mb: 2 }}
            >
              <ToggleButton value="unit" sx={{ textTransform: 'none', gap: 0.75, px: 2 }}>
                <MenuBookOutlinedIcon fontSize="small" /> A full unit
              </ToggleButton>
              <ToggleButton value="level" sx={{ textTransform: 'none', gap: 0.75, px: 2 }}>
                <FlagOutlinedIcon fontSize="small" /> A specific step
              </ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: targetKind === 'level' ? '1fr 1fr' : '1fr' }, gap: 2 }}>
              <TextField
                select
                label="Unit"
                size="small"
                value={unitId}
                onChange={(e) => {
                  setUnitId(e.target.value);
                  setLevelCode('');
                }}
              >
                {units.map((u) => (
                  <MenuItem key={u.id} value={u.id}>
                    {u.name}
                  </MenuItem>
                ))}
              </TextField>
              {targetKind === 'level' && (
                <TextField
                  select
                  label="Step"
                  size="small"
                  value={levelCode}
                  onChange={(e) => setLevelCode(e.target.value)}
                  helperText="The step the student is nudged toward next."
                >
                  {levels.map((l) => (
                    <MenuItem key={l.code} value={l.code}>
                      {l.code} · {l.title}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Box>
          </Box>

          <Divider />

          {/* Step 3 — optional note + confirm */}
          <Box>
            <StepLabel n={3} text="Add a note (optional)" />
            <TextField
              label="Note for your own reference"
              size="small"
              fullWidth
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Focus group for accessibility before Friday"
            />
          </Box>

          {summary && (
            <Alert icon={<AddTaskOutlinedIcon fontSize="inherit" />} severity="info" sx={{ bgcolor: brand.bg }}>
              {summary} The adaptive engine will prioritize this when it's a valid next step.
            </Alert>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <AddTaskOutlinedIcon />}
              disabled={disabled}
              onClick={() => void create()}
            >
              {busy ? 'Assigning…' : 'Assign'}
            </Button>
            {msg && (
              <Alert severity={msg.kind} sx={{ flex: 1, minWidth: 240, py: 0 }}>
                {msg.text}
              </Alert>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function StepLabel({ n, text }: { n: number; text: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
      <Box
        sx={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          bgcolor: brand.teal,
          color: '#fff',
          fontSize: 13,
          fontWeight: 800,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {n}
      </Box>
      <Typography sx={{ fontWeight: 700 }}>{text}</Typography>
    </Box>
  );
}

function AssignmentTable({
  assignments,
  unitName,
  studentName,
  onArchive,
}: {
  assignments: Assignment[];
  unitName: (id: string) => string;
  studentName: (id?: string) => string;
  onArchive: (id: string) => void;
}) {
  return (
    <Box component="section" sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 2, p: 2.5 }}>
      <Typography variant="h2" sx={{ fontSize: '1.15rem', mb: 1.5 }}>
        Current assignments ({assignments.length})
      </Typography>
      {assignments.length === 0 ? (
        <Typography color="text.secondary">Nothing assigned yet. Create your first assignment above.</Typography>
      ) : (
        <TableContainer>
          <Table aria-label="Current assignments">
            <TableHead>
              <TableRow>
                <TableCell>For</TableCell>
                <TableCell>Assigned</TableCell>
                <TableCell>Unit</TableCell>
                <TableCell>Note</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {a.scope === 'class' ? <GroupsOutlinedIcon fontSize="small" /> : <PersonOutlineIcon fontSize="small" />}
                      {a.scope === 'class' ? 'Whole class' : studentName(a.studentId)}
                    </Box>
                  </TableCell>
                  <TableCell>{a.targetKind === 'unit' ? 'Full unit' : `Step ${a.levelCode ?? ''}`}</TableCell>
                  <TableCell>{unitName(a.unitId)}</TableCell>
                  <TableCell sx={{ color: a.note ? 'inherit' : 'text.disabled' }}>{a.note || '—'}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={a.status === 'active' ? 'primary' : 'default'}
                      variant={a.status === 'active' ? 'filled' : 'outlined'}
                      label={a.status}
                    />
                  </TableCell>
                  <TableCell align="right">
                    {a.status === 'active' && (
                      <Button size="small" startIcon={<ArchiveOutlinedIcon />} onClick={() => onArchive(a.id)}>
                        Archive
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
