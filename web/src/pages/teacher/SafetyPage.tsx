import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import { api, type FilterAudit, type FilterCount, type FilterOutcome } from '../../api';
import { brand } from '../../theme';
import { HeaderStat, TeacherHeader } from './TeacherHeader';

const pct = (c: FilterCount) => (c.required === 0 ? '—' : `${Math.floor((c.checked / c.required) * 100)}%`);

const CONTEXT_LABEL = { submission: 'Student work', assistant: 'AI assistant', coaching: 'Coaching' } as const;
const SOURCE_LABEL: Record<string, string> = {
  guardrail: 'Bedrock Guardrail',
  local: 'Local check',
  'local-pii': 'Personal info',
  'local-unsafe': 'Unsafe content',
  error: 'Filter error (withheld)',
};
const OUTCOME_STYLE: Record<FilterOutcome, { label: string; color: 'success' | 'warning' | 'error' }> = {
  pass: { label: 'Passed', color: 'success' },
  blocked: { label: 'Blocked', color: 'warning' },
  error: { label: 'Withheld', color: 'error' },
};

/** Filter audit log (BRD M7): every content-filter check on inputs and outputs, outcomes only. */
export function SafetyPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<FilterAudit | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .getFilterAudit()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  if (error) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">Could not load the safety log: {error}</Alert>
      </Container>
    );
  }
  if (!data) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', flex: 1 }}>
        <CircularProgress aria-label="Loading safety log" />
      </Box>
    );
  }

  const gaps = [data.coverage.submissions, data.coverage.coaching, data.coverage.assistantReplies].reduce(
    (n, c) => n + (c.required - c.checked),
    0,
  );
  const rows: { label: string; count: FilterCount; note: string }[] = [
    {
      label: 'Student work',
      count: data.coverage.submissions,
      note: 'Every submission, checked before it is stored or scored',
    },
    {
      label: 'Coaching',
      count: data.coverage.coaching,
      note: 'Every coaching message, checked before the student sees it',
    },
    {
      label: 'AI assistant replies',
      count: data.coverage.assistantReplies,
      note: 'Every reply to a question that passed the input check',
    },
  ];

  return (
    <Box sx={{ flex: 1 }}>
      <TeacherHeader
        eyebrow="Safety · Content filtering"
        title="Filter audit log"
        subtitle="Every student input and every AI output is checked before delivery. Only outcomes are logged, never the text."
        right={
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <HeaderStat label="inputs checked" value={`${data.inputs.checked}/${data.inputs.required}`} />
            <HeaderStat label="outputs checked" value={`${data.outputs.checked}/${data.outputs.required}`} />
            <HeaderStat label="blocked" value={data.inputs.blocked + data.outputs.blocked} />
            <HeaderStat label="withheld (filter error)" value={data.inputs.errors + data.outputs.errors} />
          </Box>
        }
      />

      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/teacher')} sx={{ color: brand.charcoal }}>
            Class
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button startIcon={<RefreshIcon />} onClick={load} sx={{ color: brand.charcoal }}>
            Refresh
          </Button>
        </Box>

        <Alert severity={gaps === 0 ? 'success' : 'error'} sx={{ mb: 2 }}>
          {gaps === 0
            ? 'Coverage 100%: nothing reached a student without passing the filter.'
            : `${gaps} item(s) have no filter record. Check the API logs.`}
        </Alert>

        <TableContainer sx={{ bgcolor: '#fff', borderRadius: 2, border: `1px solid ${brand.borderLight}`, mb: 3 }}>
          <Table aria-label="Filter coverage">
            <TableHead>
              <TableRow>
                <TableCell>What</TableCell>
                <TableCell align="right">Checked</TableCell>
                <TableCell align="right">Coverage</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Rule</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.label} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                  <TableCell sx={{ fontWeight: 700 }}>{r.label}</TableCell>
                  <TableCell align="right">
                    {r.count.checked}/{r.count.required}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {pct(r.count)}
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, color: 'text.secondary' }}>
                    {r.note}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Typography variant="h2" sx={{ fontSize: '1.2rem', mb: 1 }}>
          Recent checks
        </Typography>
        {data.recent.length === 0 ? (
          <Typography color="text.secondary">
            No checks yet. They appear as students submit work or ask the assistant.
          </Typography>
        ) : (
          <TableContainer sx={{ bgcolor: '#fff', borderRadius: 2, border: `1px solid ${brand.borderLight}` }}>
            <Table size="small" aria-label="Recent filter checks">
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Student</TableCell>
                  <TableCell>Where</TableCell>
                  <TableCell>Direction</TableCell>
                  <TableCell>Result</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Decided by</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.recent.map((e, i) => (
                  <TableRow key={`${e.at}-${i}`} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(e.at).toLocaleTimeString()}</TableCell>
                    <TableCell>{e.displayName}</TableCell>
                    <TableCell>{CONTEXT_LABEL[e.context]}</TableCell>
                    <TableCell>{e.direction === 'input' ? 'Student → AI' : 'AI → student'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={OUTCOME_STYLE[e.outcome].label}
                        color={OUTCOME_STYLE[e.outcome].color}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      {SOURCE_LABEL[e.source] ?? e.source}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Container>
    </Box>
  );
}
