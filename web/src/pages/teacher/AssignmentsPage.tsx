import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
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
import AddTaskOutlinedIcon from '@mui/icons-material/AddTaskOutlined';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import { api, type AssignableUnit, type Assignment } from '../../api';
import type { CreateAssignmentBody } from '../../api/client';
import { brand } from '../../theme';
import { HeaderStat, TeacherHeader } from './TeacherHeader';

/** Teacher assignments: list what's assigned and create or archive assignments. */
export function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [units, setUnits] = useState<AssignableUnit[]>([]);
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
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const active = assignments.filter((a) => a.status === 'active');

  const archive = async (id: string) => {
    try {
      const updated = await api.archiveAssignment(id);
      setAssignments((xs) => xs.map((a) => (a.id === id ? updated : a)));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? id;

  return (
    <Box sx={{ flex: 1 }}>
      <TeacherHeader
        eyebrow="Curriculum"
        title="Assignments"
        subtitle="Assign a unit or a specific level to your class or an individual student."
        right={
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <HeaderStat label="active" value={active.length} />
            <HeaderStat label="total" value={assignments.length} />
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
            <CreateForm units={units} onCreated={(a) => setAssignments((xs) => [a, ...xs])} />

            <Box component="section" sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 2, p: 2.5 }}>
              <Typography variant="h2" sx={{ fontSize: '1.15rem', mb: 1.5 }}>
                Current assignments ({assignments.length})
              </Typography>
              {assignments.length === 0 ? (
                <Typography color="text.secondary">No assignments yet. Create one above.</Typography>
              ) : (
                <TableContainer>
                  <Table aria-label="Current assignments">
                    <TableHead>
                      <TableRow>
                        <TableCell>Scope</TableCell>
                        <TableCell>Target</TableCell>
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
                            {a.scope === 'class' ? 'Whole class' : `Student${a.studentId ? ` · ${a.studentId}` : ''}`}
                          </TableCell>
                          <TableCell>
                            {a.targetKind === 'unit' ? 'Full unit' : `Level ${a.levelCode ?? ''}`}
                          </TableCell>
                          <TableCell>{unitName(a.unitId)}</TableCell>
                          <TableCell>{a.note || '—'}</TableCell>
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
                              <Button
                                size="small"
                                startIcon={<ArchiveOutlinedIcon />}
                                onClick={() => void archive(a.id)}
                              >
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
          </>
        )}
      </Container>
    </Box>
  );
}

function CreateForm({ units, onCreated }: { units: AssignableUnit[]; onCreated: (a: Assignment) => void }) {
  const [scope, setScope] = useState<'class' | 'student'>('class');
  const [targetKind, setTargetKind] = useState<'unit' | 'level'>('unit');
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [levelCode, setLevelCode] = useState('');
  const [studentId, setStudentId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const levels = useMemo(() => units.find((u) => u.id === unitId)?.levels ?? [], [units, unitId]);

  const create = async () => {
    if (!unitId) return;
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
      setMsg({ kind: 'success', text: 'Assignment created.' });
      setNote('');
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const disabled =
    busy || !unitId || (scope === 'student' && !studentId) || (targetKind === 'level' && !levelCode);

  return (
    <Box component="section" sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 2, p: 2.5 }}>
      <Typography variant="h2" sx={{ fontSize: '1.15rem', mb: 0.5 }}>
        Create an assignment
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Assign a full unit or a single level, to the whole class or one student.
      </Typography>
      {units.length === 0 ? (
        <Alert severity="info">No assignable units are available right now.</Alert>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2, mb: 2 }}>
            <TextField select label="Scope" size="small" value={scope} onChange={(e) => setScope(e.target.value as 'class' | 'student')}>
              <MenuItem value="class">Whole class</MenuItem>
              <MenuItem value="student">A single student</MenuItem>
            </TextField>
            {scope === 'student' && (
              <TextField
                label="Student id"
                size="small"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="e.g. s-ava"
              />
            )}
            <TextField
              select
              label="Target"
              size="small"
              value={targetKind}
              onChange={(e) => setTargetKind(e.target.value as 'unit' | 'level')}
            >
              <MenuItem value="unit">Full unit</MenuItem>
              <MenuItem value="level">A single level</MenuItem>
            </TextField>
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
              <TextField select label="Level" size="small" value={levelCode} onChange={(e) => setLevelCode(e.target.value)}>
                {levels.map((l) => (
                  <MenuItem key={l.code} value={l.code}>
                    {l.code} · {l.title}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Box>
          <TextField
            label="Note (optional)"
            size="small"
            fullWidth
            value={note}
            onChange={(e) => setNote(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <AddTaskOutlinedIcon />}
              disabled={disabled}
              onClick={() => void create()}
            >
              {busy ? 'Creating…' : 'Create assignment'}
            </Button>
            {msg && (
              <Alert severity={msg.kind} sx={{ flex: 1, minWidth: 240, py: 0 }}>
                {msg.text}
              </Alert>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
