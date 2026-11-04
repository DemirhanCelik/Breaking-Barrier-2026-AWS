import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  TextField,
  Typography,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import { api, type ContentItem } from '../../api';
import { useSession } from '../../session';
import { brand } from '../../theme';
import { STAGE_NAMES } from '../teacher/StageCell';
import { TeacherHeader } from '../teacher/TeacherHeader';
import { AdminHeader } from './AdminHeader';

const CRITERIA: Record<string, string> = {
  alignment: 'Objective alignment',
  scaffolding: 'Scaffolding',
  clarity: 'Clarity',
  no_giveaway: 'No giveaway',
  safety_inclusion: 'Safe & inclusive',
  formative_tone: 'Formative tone',
};

/**
 * Pending AI-generated items awaiting human approval. Reused by admins and teachers:
 * the header adapts to the signed-in role, the queue and actions are identical.
 */
export function ReviewQueuePage() {
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';
  const [items, setItems] = useState<ContentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    api
      .getReviewItems('pending')
      .then((r) => setItems(r.items))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const onReviewed = () => load();

  const Header = isAdmin ? AdminHeader : TeacherHeader;

  return (
    <Box sx={{ flex: 1 }}>
      <Header
        eyebrow={isAdmin ? 'Administration' : 'Curriculum'}
        title="Review queue"
        subtitle="AI drafted these items. Approve or reject each one before it reaches a student."
        right={
          <Button
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
            onClick={load}
            disabled={loading}
            sx={{ color: '#fff' }}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      />
      <Container maxWidth="lg" sx={{ py: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error && (
          <Alert severity="error" action={<Button color="inherit" onClick={load}>Try again</Button>}>
            {error}
          </Alert>
        )}
        {loading && items.length === 0 ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
            <CircularProgress aria-label="Loading review queue" />
          </Box>
        ) : items.length === 0 ? (
          <Typography color="text.secondary">Nothing waiting for review right now.</Typography>
        ) : (
          items.map((item) => <ReviewCard key={item.id} item={item} onReviewed={onReviewed} />)
        )}
      </Container>
    </Box>
  );
}

function ReviewCard({ item, onReviewed }: { item: ContentItem; onReviewed: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = item.quality;
  const scoreEntries = useMemo(() => Object.entries(q?.scores ?? {}), [q]);

  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      await api.reviewItem(item.id, decision, undefined, note);
      onReviewed();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Box
      component="article"
      sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 2, p: 2.5 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography sx={{ fontWeight: 800, flex: 1, minWidth: 200 }}>{item.title}</Typography>
        <Chip size="small" label={`${STAGE_NAMES[item.fromStage]} → ${STAGE_NAMES[item.targetStage]}`} />
        {q && (
          <Chip
            size="small"
            color={q.passed ? 'success' : 'warning'}
            variant={q.passed ? 'filled' : 'outlined'}
            label={q.passed ? 'Meets the rubric' : 'Below the rubric'}
          />
        )}
      </Box>

      <Typography variant="body2" sx={{ mb: 0.75 }}>
        <b>Scenario:</b> {item.scenario}
      </Typography>
      <Typography variant="body2" sx={{ mb: 0.75 }}>
        <b>Task:</b> {item.task}
      </Typography>
      <Typography variant="body2" sx={{ mb: 0.75 }}>
        <b>Tip:</b> {item.tip}
      </Typography>

      {scoreEntries.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
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
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {q.notes}
        </Typography>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          sx={{ flex: 1, minWidth: 180 }}
        />
        <Button size="small" color="error" startIcon={<CloseIcon />} onClick={() => void decide('reject')} disabled={busy}>
          Reject
        </Button>
        <Button
          size="small"
          variant="contained"
          startIcon={<CheckIcon />}
          onClick={() => void decide('approve')}
          disabled={busy}
        >
          Approve
        </Button>
      </Box>
    </Box>
  );
}
