import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  api,
  type AuthoringState,
  type ClassAttainment,
  type ContentEdits,
  type ContentItem,
  type ContentStatus,
  type Stage,
} from '../../api';
import { brand } from '../../theme';
import { STAGE_NAMES } from './StageCell';
import { HeaderStat, TeacherHeader } from './TeacherHeader';

const CRITERIA: Record<string, string> = {
  alignment: 'Objective alignment',
  scaffolding: 'Scaffolding',
  clarity: 'Clarity',
  no_giveaway: 'No giveaway',
  safety_inclusion: 'Safe & inclusive',
  formative_tone: 'Formative tone',
};

const SAMPLE = {
  title: 'Teacher notes: prompting an AI well',
  text:
    'When students ask an AI to build part of a webpage, the first prompt is usually too vague. A strong prompt ' +
    'names the goal of the page, gives a constraint such as the colors, size, or number of sections, and says what ' +
    'the AI should do in an edge case, like an empty events list or a very long club name. After the AI answers, ' +
    'students should compare the output to what they intended and change one thing at a time, so they can tell ' +
    'which change made the difference. Questions? Email the CS office at cs-office@example.org.',
};

/**
 * AI-assisted authoring (design §7B): AI drafts practice grounded in source material,
 * every draft is filtered and scored by the curriculum-quality judge, and a person
 * approves, edits, or rejects it. Only approved items reach students.
 */
export function AuthoringPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<AuthoringState | null>(null);
  const [cls, setCls] = useState<ClassAttainment | null>(null);
  const [tab, setTab] = useState<ContentStatus>('pending');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([api.getAuthoring(), api.getClassAttainment()])
      .then(([a, c]) => {
        setData(a);
        setCls(c);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  const replace = (item: ContentItem) =>
    setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === item.id ? item : i)) } : d));

  if (error && !data) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">Could not load authoring: {error}</Alert>
      </Container>
    );
  }
  if (!data || !cls) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', flex: 1 }}>
        <CircularProgress aria-label="Loading authoring" />
      </Box>
    );
  }

  const count = (s: ContentStatus) => data.items.filter((i) => i.status === s).length;
  const cname = (id: string) => cls.concepts.find((c) => c.id === id)?.name ?? id;
  const shown = data.items.filter((i) => i.status === tab);

  return (
    <Box sx={{ flex: 1 }}>
      <TeacherHeader
        eyebrow="Curriculum · AI drafts, people approve"
        title="AI-assisted authoring"
        subtitle="Paste source material, let AI draft practice grounded in it, then review. Only approved items reach students."
        right={
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <HeaderStat label="waiting for review" value={count('pending')} />
            <HeaderStat label="approved" value={count('approved')} />
            <HeaderStat
              label="practice served (AI / approved / authored)"
              value={`${data.practice.generated} / ${data.practice.fromApprovedBank} / ${data.practice.fromAuthored}`}
            />
          </Box>
        }
      />

      <Container maxWidth="lg" sx={{ py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/teacher')} sx={{ color: brand.charcoal }}>
            Class
          </Button>
        </Box>

        <DraftForm
          concepts={cls.concepts.map((c) => ({ id: c.id, name: c.name }))}
          onDrafted={(items) => {
            setData((d) => (d ? { ...d, items: [...items, ...d.items] } : d));
            setTab('pending');
          }}
        />

        <Box>
          <Tabs value={tab} onChange={(_, v: ContentStatus) => setTab(v)} sx={{ mb: 2 }}>
            <Tab value="pending" label={`Review queue (${count('pending')})`} />
            <Tab value="approved" label={`Approved (${count('approved')})`} />
            <Tab value="rejected" label={`Rejected (${count('rejected')})`} />
          </Tabs>
          {shown.length === 0 ? (
            <Typography color="text.secondary">
              {tab === 'pending' ? 'Nothing to review. Draft some practice above.' : 'Nothing here yet.'}
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {shown.map((item) => (
                <ItemCard key={item.id} item={item} conceptName={cname(item.conceptId)} onChange={replace} />
              ))}
            </Box>
          )}
        </Box>

        <BankTable data={data} conceptName={cname} />
      </Container>
    </Box>
  );
}

function DraftForm({
  concepts,
  onDrafted,
}: {
  concepts: { id: string; name: string }[];
  onDrafted: (items: ContentItem[]) => void;
}) {
  const [concept, setConcept] = useState(concepts[2]?.id ?? concepts[0]?.id ?? '');
  const [from, setFrom] = useState<Stage>(1);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const draft = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.draftContent({ concept, fromStage: from, sourceTitle: title, sourceText: text, count });
      onDrafted(r.items);
      setMsg({
        kind: 'success',
        text:
          `${r.items.length} draft(s) added to the review queue.` +
          (r.redactions
            ? ` ${r.redactions} piece(s) of personal info were redacted before the AI saw the source.`
            : ''),
      });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      component="section"
      sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 2, p: 2.5 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h2" sx={{ fontSize: '1.15rem', flex: 1 }}>
          Draft practice from source material
        </Typography>
        <Button
          size="small"
          onClick={() => {
            setTitle(SAMPLE.title);
            setText(SAMPLE.text);
          }}
        >
          Use sample notes
        </Button>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 120px' }, gap: 2, mb: 2 }}>
        <TextField select label="Concept" value={concept} onChange={(e) => setConcept(e.target.value)} size="small">
          {concepts.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Practice for students moving"
          value={from}
          onChange={(e) => setFrom(Number(e.target.value) as Stage)}
          size="small"
        >
          {([0, 1, 2] as const).map((s) => (
            <MenuItem key={s} value={s}>
              {STAGE_NAMES[s]} → {STAGE_NAMES[(s + 1) as Stage]}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="Drafts" value={count} onChange={(e) => setCount(Number(e.target.value))} size="small">
          {[1, 2, 3].map((n) => (
            <MenuItem key={n} value={n}>
              {n}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <TextField
        label="Source title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        size="small"
        fullWidth
        sx={{ mb: 2 }}
      />
      <TextField
        label="Source material (notes, a passage from a doc or slides)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        multiline
        minRows={5}
        fullWidth
        inputProps={{ maxLength: 12000 }}
        helperText="Personal info (emails, phone numbers) is redacted before the AI sees it. The source is filtered, and every draft is checked against it."
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeOutlinedIcon />}
          disabled={busy || text.trim().length < 40}
          onClick={() => void draft()}
        >
          {busy ? 'Drafting and checking...' : 'Draft with AI'}
        </Button>
        {msg && (
          <Alert severity={msg.kind} sx={{ flex: 1, minWidth: 240, py: 0 }}>
            {msg.text}
          </Alert>
        )}
      </Box>
    </Box>
  );
}

function ItemCard({
  item,
  conceptName,
  onChange,
}: {
  item: ContentItem;
  conceptName: string;
  onChange: (i: ContentItem) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<ContentEdits>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withheld = item.filter?.ok === false;
  const q = item.quality;
  const scoreEntries = useMemo(() => Object.entries(q?.scores ?? {}), [q]);

  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      onChange(await api.reviewContent(item.id, decision, editing ? edits : undefined, note));
      setEditing(false);
      setEdits({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = (f: 'title' | 'scenario' | 'task' | 'tip', label: string) =>
    editing ? (
      <TextField
        label={label}
        size="small"
        fullWidth
        multiline={f !== 'title'}
        value={edits[f] ?? item[f]}
        onChange={(e) => setEdits((x) => ({ ...x, [f]: e.target.value }))}
        sx={{ mb: 1.5 }}
      />
    ) : f === 'title' ? null : (
      <Typography variant="body2" sx={{ mb: 0.75 }}>
        <b>{label}:</b> {item[f]}
      </Typography>
    );

  return (
    <Box
      component="article"
      sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 2, p: 2.5 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography sx={{ fontWeight: 800, flex: 1, minWidth: 200 }}>{item.title}</Typography>
        <Chip
          size="small"
          label={`${conceptName}: ${STAGE_NAMES[item.fromStage]} → ${STAGE_NAMES[item.targetStage]}`}
        />
        {item.version > 1 && <Chip size="small" variant="outlined" label={`v${item.version} (edited)`} />}
      </Box>

      {field('title', 'Title')}
      {field('scenario', 'Scenario')}
      {field('task', 'Task')}
      {field('tip', 'Tip')}

      {/* Quality judge */}
      <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#f7f8f9', borderRadius: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Quality check
          </Typography>
          {q ? (
            <Chip
              size="small"
              color={q.passed ? 'success' : 'warning'}
              label={q.passed ? 'Meets the rubric' : 'Below the rubric'}
              variant={q.passed ? 'filled' : 'outlined'}
            />
          ) : (
            <Chip size="small" label="Not scored" variant="outlined" />
          )}
          {q?.judge === 'skipped' && <Chip size="small" variant="outlined" label="pre-checks only" />}
        </Box>
        {scoreEntries.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 0.5 }}>
            {scoreEntries.map(([k, v]) => (
              <Chip
                key={k}
                size="small"
                variant="outlined"
                color={v >= 3 ? 'default' : 'warning'}
                label={`${CRITERIA[k] ?? k}: ${v}/4`}
              />
            ))}
          </Box>
        )}
        {q?.notes && (
          <Typography variant="body2" color="text.secondary">
            {q.notes}
          </Typography>
        )}
      </Box>

      {/* Provenance */}
      {item.sourceQuote && (
        <Box sx={{ mt: 1.5, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          {item.quoteVerified ? (
            <Tooltip title="This quote was found word for word in the source">
              <VerifiedOutlinedIcon fontSize="small" sx={{ color: 'success.main', mt: 0.25 }} />
            </Tooltip>
          ) : (
            <Tooltip title="This quote was NOT found in the source; check the draft against the material">
              <WarningAmberIcon fontSize="small" sx={{ color: 'warning.main', mt: 0.25 }} />
            </Tooltip>
          )}
          <Typography variant="body2" color="text.secondary">
            Based on {item.sourceTitle ? <i>{item.sourceTitle}</i> : 'the source'}: “{item.sourceQuote}”
            {!item.quoteVerified && ' (quote not found in source)'}
          </Typography>
        </Box>
      )}

      {item.reviewerNote && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          <b>Reviewer note:</b> {item.reviewerNote}
        </Typography>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}

      {!withheld && item.status !== 'rejected' && (
        <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          {item.status === 'pending' && (
            <TextField
              size="small"
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              sx={{ flex: 1, minWidth: 180 }}
            />
          )}
          {item.status === 'approved' && <Box sx={{ flex: 1 }} />}
          <Button
            size="small"
            startIcon={<EditOutlinedIcon />}
            onClick={() => {
              setEditing((e) => !e);
              setEdits({});
            }}
            disabled={busy}
          >
            {editing ? 'Cancel edit' : 'Edit'}
          </Button>
          {item.status === 'pending' && (
            <Button
              size="small"
              color="error"
              startIcon={<CloseIcon />}
              onClick={() => void decide('reject')}
              disabled={busy}
            >
              Reject
            </Button>
          )}
          {(item.status === 'pending' || editing) && (
            <Button
              size="small"
              variant="contained"
              startIcon={<CheckIcon />}
              onClick={() => void decide('approve')}
              disabled={busy}
            >
              {editing ? 'Save and approve' : 'Approve'}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}

function BankTable({ data, conceptName }: { data: AuthoringState; conceptName: (id: string) => string }) {
  const concepts = [...new Set(data.bank.map((b) => b.conceptId))];
  return (
    <Box
      component="section"
      sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 2, p: 2.5 }}
    >
      <Typography variant="h2" sx={{ fontSize: '1.15rem', mb: 0.5 }}>
        Practice bank
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        What students get when live AI practice is off, blocked, or below the rubric: approved drafts first, then
        authored items.
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Box
          component="table"
          sx={{ borderCollapse: 'collapse', fontSize: 14, '& td, & th': { px: 1.5, py: 0.75, textAlign: 'left' } }}
        >
          <thead>
            <tr>
              <th>Concept</th>
              {([0, 1, 2] as const).map((s) => (
                <th key={s}>
                  {STAGE_NAMES[s]} → {STAGE_NAMES[(s + 1) as Stage]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {concepts.map((cid) => (
              <tr key={cid}>
                <td style={{ fontWeight: 700 }}>{conceptName(cid)}</td>
                {data.bank
                  .filter((b) => b.conceptId === cid)
                  .map((b) => (
                    <td key={b.fromStage}>
                      {b.authored} authored{b.approved ? ` + ${b.approved} approved` : ''}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </Box>
      </Box>
    </Box>
  );
}
