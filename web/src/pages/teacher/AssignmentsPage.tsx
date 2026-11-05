import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import AddTaskOutlinedIcon from '@mui/icons-material/AddTaskOutlined';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import CenterFocusStrongOutlinedIcon from '@mui/icons-material/CenterFocusStrongOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import {
  api,
  type AssignableUnit,
  type Assignment,
  type AssignmentProgress,
  type AssignmentProgressState,
  type AssignmentScope,
  type AssignmentTargetKind,
  type RosterStudent,
  type TeacherConcept,
} from '../../api';
import type { CreateAssignmentBody } from '../../api/client';
import { brand } from '../../theme';
import { HeaderStat, TeacherHeader } from './TeacherHeader';

export const PROGRESS_STYLE: Record<AssignmentProgressState, { label: string; bg: string; fg: string; border: string }> = {
  met: { label: 'Met', bg: '#e7f5ec', fg: '#2f7a4b', border: '#b9e2c8' },
  active: { label: 'Working on it', bg: '#f1eef8', fg: brand.purple, border: '#d9d1ee' },
  queued: { label: 'Next up', bg: brand.tealLight, fg: brand.tealDark, border: '#9fdde3' },
  waiting: { label: 'Not started', bg: '#f4f2ec', fg: brand.gray, border: '#e6e2d8' },
  blocked: { label: 'Can’t apply yet', bg: '#fff4e0', fg: '#94611a', border: '#f6d49a' },
};

/** One card per assignment; a group created from Insights is one card for all its students. */
interface Batch {
  key: string;
  items: Assignment[];
  progress: AssignmentProgress[];
}

function batchAssignments(assignments: Assignment[]): Batch[] {
  const batches = new Map<string, Batch>();
  for (const a of assignments) {
    const key = a.groupLabel
      ? ['g', a.groupLabel, a.targetKind, a.conceptId, a.levelCode, a.dueOn, a.note, a.status, a.createdAt.slice(0, 16)].join('|')
      : a.id;
    const b = batches.get(key) ?? { key, items: [], progress: [] };
    b.items.push(a);
    b.progress.push(...(a.progress ?? []));
    batches.set(key, b);
  }
  return [...batches.values()];
}

/**
 * Teacher assignments. A skill focus asks the adaptive engine to prefer steps
 * that build one skill, among the steps the rules already allow, so it never
 * skips what a student isn't ready for. Every assignment shows how it is landing
 * for each student, with the reason.
 */
export function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [units, setUnits] = useState<AssignableUnit[]>([]);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [concepts, setConcepts] = useState<TeacherConcept[]>([]);
  const [currentUnitId, setCurrentUnitId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    api
      .listAssignments()
      .then((r) => {
        setAssignments(r.assignments);
        setUnits(r.units);
        setStudents(r.students);
        setConcepts(r.concepts ?? []);
        setCurrentUnitId(r.currentUnitId);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const active = assignments.filter((a) => a.status === 'active');
  const batches = useMemo(
    () => batchAssignments(assignments.filter((a) => showArchived || a.status === 'active')),
    [assignments, showArchived],
  );
  const archivedCount = assignments.length - active.length;
  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? id;
  const studentName = (id?: string) => (id ? (students.find((s) => s.id === id)?.name ?? id) : '');
  const needsLook = active.flatMap((a) => a.progress ?? []).filter((p) => p.state === 'blocked' || p.overdue).length;

  const archive = async (ids: string[]) => {
    try {
      const updated = await Promise.all(ids.map((id) => api.archiveAssignment(id)));
      setAssignments((xs) => xs.map((a) => updated.find((u) => u.id === a.id) ?? a));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Box sx={{ flex: 1 }}>
      <TeacherHeader
        eyebrow="Curriculum"
        title="Assignments"
        subtitle="Point students at a skill, a unit, or a step. Assignments steer the adaptive path. They never skip what a student isn’t ready for."
        right={
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <HeaderStat label="active" value={batches.filter((b) => b.items[0].status === 'active').length} />
            <HeaderStat label="need a look" value={needsLook} />
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
              concepts={concepts}
              currentUnitId={currentUnitId}
              onCreated={(a) => setAssignments((xs) => [a, ...xs])}
            />
            <Box component="section">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
                <Typography variant="h2" sx={{ fontSize: '1.2rem', flex: 1 }}>
                  How your assignments are landing
                </Typography>
                <Button component={RouterLink} to="/teacher/paths" size="small">
                  See everyone’s path
                </Button>
                {archivedCount > 0 && (
                  <Button size="small" onClick={() => setShowArchived((v) => !v)} sx={{ color: brand.charcoal }}>
                    {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
                  </Button>
                )}
              </Box>
              {batches.length === 0 ? (
                <Typography color="text.secondary">
                  Nothing assigned yet. Create one above, or assign a skill focus to a group from the Insights page.
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {batches.map((b) => (
                    <AssignmentCard
                      key={b.key}
                      batch={b}
                      unitName={unitName}
                      studentName={studentName}
                      onArchive={() => void archive(b.items.map((a) => a.id))}
                    />
                  ))}
                </Box>
              )}
            </Box>
          </>
        )}
      </Container>
    </Box>
  );
}

/** Guided create flow: who → what → note and due date → confirm. */
function CreateForm({
  units,
  students,
  concepts,
  currentUnitId,
  onCreated,
}: {
  units: AssignableUnit[];
  students: RosterStudent[];
  concepts: TeacherConcept[];
  currentUnitId?: string;
  onCreated: (a: Assignment) => void;
}) {
  const [scope, setScope] = useState<AssignmentScope>('class');
  const [targetKind, setTargetKind] = useState<AssignmentTargetKind>('concept');
  const [unitId, setUnitId] = useState('');
  const [levelCode, setLevelCode] = useState('');
  const [conceptId, setConceptId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [note, setNote] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!unitId && units.length) setUnitId(currentUnitId && units.some((u) => u.id === currentUnitId) ? currentUnitId : units[0].id);
  }, [units, unitId, currentUnitId]);

  // Skills belong to the active unit.
  const effectiveUnitId = targetKind === 'concept' ? (currentUnitId ?? unitId) : unitId;
  const unit = units.find((u) => u.id === effectiveUnitId);
  const levels = useMemo(() => unit?.levels ?? [], [unit]);
  const level = levels.find((l) => l.code === levelCode);
  const concept = concepts.find((c) => c.id === conceptId);
  const studentLabel = students.find((s) => s.id === studentId)?.name;

  const incomplete =
    !effectiveUnitId ||
    (scope === 'student' && !studentId) ||
    (targetKind === 'level' && !levelCode) ||
    (targetKind === 'concept' && !conceptId);
  const disabled = busy || incomplete;

  const who = scope === 'class' ? 'Everyone in your class' : (studentLabel ?? 'This student');
  const summary = incomplete
    ? null
    : targetKind === 'concept'
      ? `${who} will get steps that build “${concept?.name}” first, among the steps they’re ready for. Students who already meet it are unaffected.`
      : targetKind === 'unit'
        ? `${who} will have “${unit?.name}” as their assigned course.`
        : `${who} will be nudged toward step ${level?.code} · ${level?.title} when it’s a valid next step.`;

  const create = async () => {
    if (disabled) return;
    setBusy(true);
    setMsg(null);
    try {
      const body: CreateAssignmentBody = {
        scope,
        targetKind,
        unitId: effectiveUnitId,
        ...(scope === 'student' && studentId ? { studentId } : {}),
        ...(targetKind === 'level' && levelCode ? { levelCode } : {}),
        ...(targetKind === 'concept' && conceptId ? { conceptId } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(dueOn ? { dueOn } : {}),
      };
      const created = await api.createAssignment(body);
      onCreated(created);
      setMsg({ kind: 'success', text: 'Assigned. See below how it lands for each student.' });
      setNote('');
      setDueOn('');
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
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
              For a small group, use “Assign focus” on a group in Insights.
            </Typography>
          </Box>

          <Divider />

          <Box>
            <StepLabel n={2} text="What should they work on?" />
            <ToggleButtonGroup
              exclusive
              value={targetKind}
              onChange={(_, v: AssignmentTargetKind | null) => v && setTargetKind(v)}
              size="small"
              sx={{ mb: 2, flexWrap: 'wrap' }}
            >
              <ToggleButton value="concept" sx={{ textTransform: 'none', gap: 0.75, px: 2 }}>
                <CenterFocusStrongOutlinedIcon fontSize="small" /> A skill to focus on
              </ToggleButton>
              <ToggleButton value="unit" sx={{ textTransform: 'none', gap: 0.75, px: 2 }}>
                <MenuBookOutlinedIcon fontSize="small" /> A full unit
              </ToggleButton>
              <ToggleButton value="level" sx={{ textTransform: 'none', gap: 0.75, px: 2 }}>
                <FlagOutlinedIcon fontSize="small" /> A specific step
              </ToggleButton>
            </ToggleButtonGroup>
            {targetKind === 'concept' ? (
              <TextField
                select
                label="Skill"
                size="small"
                fullWidth
                value={conceptId}
                onChange={(e) => setConceptId(e.target.value)}
                helperText="Recommended. Their next steps build this skill first, at each student’s own level."
              >
                {concepts.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
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
                    helperText="Used when it’s a valid next step for the student."
                  >
                    {levels.map((l) => (
                      <MenuItem key={l.code} value={l.code}>
                        {l.code} · {l.title}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              </Box>
            )}
          </Box>

          <Divider />

          <Box>
            <StepLabel n={3} text="Message and due date (optional)" />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 200px' }, gap: 2 }}>
              <TextField
                label="Message for students"
                size="small"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Think about who might not be able to use your page."
                helperText="Students see this on their lesson, privately."
                inputProps={{ maxLength: 300 }}
              />
              <TextField
                label="Due"
                type="date"
                size="small"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Box>
          </Box>

          {summary && (
            <Alert icon={<AddTaskOutlinedIcon fontSize="inherit" />} severity="info" sx={{ bgcolor: brand.bg }}>
              {summary}
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

function formatDue(d: string) {
  const date = new Date(`${d}T12:00:00`);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function AssignmentCard({
  batch,
  unitName,
  studentName,
  onArchive,
}: {
  batch: Batch;
  unitName: (id: string) => string;
  studentName: (id?: string) => string;
  onArchive: () => void;
}) {
  const a = batch.items[0];
  const archived = a.status !== 'active';
  const who = a.groupLabel
    ? `${a.groupLabel} (${batch.items.length})`
    : a.scope === 'class'
      ? 'Whole class'
      : studentName(a.studentId);
  const what =
    a.targetKind === 'concept'
      ? `Focus: ${a.conceptName ?? a.conceptId}`
      : a.targetKind === 'unit'
        ? `Course: ${unitName(a.unitId)}`
        : `Step ${a.levelCode}${a.levelTitle ? ` · ${a.levelTitle}` : ''}`;
  const counts = batch.progress.reduce<Partial<Record<AssignmentProgressState, number>>>((m, p) => {
    m[p.state] = (m[p.state] ?? 0) + 1;
    return m;
  }, {});
  const order: AssignmentProgressState[] = ['met', 'active', 'queued', 'blocked', 'waiting'];

  return (
    <Box
      sx={{
        bgcolor: '#fff',
        border: `1px solid ${brand.borderLight}`,
        borderRadius: 2,
        p: 2.25,
        opacity: archived ? 0.6 : 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1.05rem' }}>{what}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5, flexWrap: 'wrap', color: 'text.secondary' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {a.scope === 'class' && !a.groupLabel ? <GroupsOutlinedIcon fontSize="small" /> : <PersonOutlineIcon fontSize="small" />}
              <Typography variant="body2">{who}</Typography>
            </Box>
            {a.dueOn && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <EventOutlinedIcon fontSize="small" />
                <Typography variant="body2">Due {formatDue(a.dueOn)}</Typography>
              </Box>
            )}
            {archived && <Chip size="small" variant="outlined" label="Archived" />}
          </Box>
          {a.note && (
            <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic', color: brand.charcoal }}>
              “{a.note}”
            </Typography>
          )}
        </Box>
        {!archived && (
          <Button size="small" startIcon={<ArchiveOutlinedIcon />} onClick={onArchive} sx={{ color: brand.charcoal }}>
            Archive
          </Button>
        )}
      </Box>

      {!archived && batch.progress.length > 0 && (
        <>
          <Box sx={{ display: 'flex', gap: 1, mt: 1.75, mb: 1.25, flexWrap: 'wrap' }}>
            {order
              .filter((st) => counts[st])
              .map((st) => (
                <Typography key={st} variant="body2" sx={{ fontWeight: 700, color: PROGRESS_STYLE[st].fg }}>
                  {counts[st]} {PROGRESS_STYLE[st].label.toLowerCase()}
                </Typography>
              ))
              .reduce<ReactNode[]>((acc, el, i) => (i ? [...acc, <Typography key={`sep${i}`} variant="body2" color="text.disabled">·</Typography>, el] : [el]), [])}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1 }}>
            {batch.progress.map((p) => (
              <ProgressRow key={p.studentId} p={p} />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

function ProgressRow({ p }: { p: AssignmentProgress }) {
  const style = PROGRESS_STYLE[p.state];
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.25,
        p: 1.25,
        borderRadius: 1.5,
        bgcolor: style.bg,
        border: `1px solid ${style.border}`,
        minWidth: 0,
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography
            component={RouterLink}
            to={`/teacher/students/${p.studentId}`}
            sx={{ fontWeight: 700, color: brand.charcoal, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
          >
            {p.name}
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 800, color: style.fg, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {style.label}
          </Typography>
          {p.overdue && (
            <Tooltip title="Past the due date and not met yet">
              <Chip size="small" label="Overdue" sx={{ height: 20, bgcolor: '#fde8e6', color: '#b3362f', fontWeight: 700 }} />
            </Tooltip>
          )}
        </Box>
        <Typography variant="body2" sx={{ color: brand.charcoal, mt: 0.25 }}>
          {p.detail}
        </Typography>
      </Box>
    </Box>
  );
}
