import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  FormControlLabel,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import {
  api,
  type AdminDirectory,
  type MatrixConcept,
  type SavedCurriculum,
  type Stage,
} from '../../api';
import { brand } from '../../theme';
import { STAGE_NAMES } from '../teacher/StageCell';
import { AdminHeader } from './AdminHeader';

const STAGES: Stage[] = [1, 2, 3];
const DESCRIPTOR_KEYS = ['0', '1', '2', '3'] as const;

/** Editable working copy of a proposed/saved matrix. */
interface Draft {
  bar: Stage;
  required: string[];
  concepts: MatrixConcept[];
}

/**
 * Admin uploads a unit document; the AI proposes a concept matrix which the admin
 * reviews and edits before saving. The copy stresses that this is AI-extracted
 * content under human review.
 */
export function CurriculumUploadPage() {
  const [directory, setDirectory] = useState<AdminDirectory | null>(null);
  const [unitId, setUnitId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<SavedCurriculum | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api.getAdminDirectory().then(setDirectory).catch((e: Error) => setError(e.message));
  }, []);

  const loadSaved = useCallback((id: string) => {
    setSaved(null);
    if (!id) return;
    api.getCurriculumMatrix(id).then(setSaved).catch(() => setSaved(null));
  }, []);

  useEffect(() => {
    loadSaved(unitId);
    // Reset any in-progress draft when the unit changes.
    setDraft(null);
    setSourceName(null);
    setFile(null);
    setMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [unitId, loadSaved]);

  const extract = async () => {
    if (!unitId || !file) return;
    setExtracting(true);
    setMsg(null);
    try {
      const result = await api.extractCurriculum(unitId, file);
      setSourceName(result.sourceName);
      setDraft({
        bar: result.proposed.bar,
        required: result.proposed.required,
        concepts: result.proposed.concepts,
      });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally {
      setExtracting(false);
    }
  };

  const save = async () => {
    if (!unitId || !draft) return;
    setSaving(true);
    setMsg(null);
    try {
      await api.saveCurriculum({
        unitId,
        bar: draft.bar,
        required: draft.required,
        concepts: draft.concepts,
        sourceName: sourceName ?? undefined,
      });
      setMsg({ kind: 'success', text: 'Matrix saved for this unit.' });
      setDraft(null);
      loadSaved(unitId);
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const toggleRequired = (conceptId: string) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            required: d.required.includes(conceptId)
              ? d.required.filter((id) => id !== conceptId)
              : [...d.required, conceptId],
          }
        : d,
    );

  const updateConcept = (conceptId: string, patch: Partial<MatrixConcept>) =>
    setDraft((d) =>
      d ? { ...d, concepts: d.concepts.map((c) => (c.id === conceptId ? { ...c, ...patch } : c)) } : d,
    );

  const updateDescriptor = (conceptId: string, key: (typeof DESCRIPTOR_KEYS)[number], value: string) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            concepts: d.concepts.map((c) =>
              c.id === conceptId ? { ...c, descriptors: { ...c.descriptors, [key]: value } } : c,
            ),
          }
        : d,
    );

  return (
    <Box sx={{ flex: 1 }}>
      <AdminHeader
        eyebrow="Administration"
        title="Curriculum upload"
        subtitle="Upload a unit document, review the AI-extracted concept matrix, then save it."
      />
      <Container maxWidth="lg" sx={{ py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {error && <Alert severity="error">{error}</Alert>}

        <Box component="section" sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 2, p: 2.5 }}>
          <Typography variant="h2" sx={{ fontSize: '1.15rem', mb: 0.5 }}>
            1. Choose a unit and upload the source
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload a PDF or Word document for the unit. The AI reads it and proposes a concept matrix. Nothing is saved
            until you review and confirm it below.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
            <TextField select label="Unit" size="small" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              {directory?.units.map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.name}
                </MenuItem>
              ))}
            </TextField>
            <Button
              component="label"
              variant="outlined"
              startIcon={<UploadFileOutlinedIcon />}
              sx={{ justifyContent: 'flex-start' }}
            >
              {file ? file.name : 'Choose PDF or DOCX'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx"
                hidden
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Button>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={extracting ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeOutlinedIcon />}
              disabled={extracting || !unitId || !file}
              onClick={() => void extract()}
            >
              {extracting ? 'Extracting with AI…' : 'Extract matrix with AI'}
            </Button>
            {msg && (
              <Alert severity={msg.kind} sx={{ flex: 1, minWidth: 240, py: 0 }}>
                {msg.text}
              </Alert>
            )}
          </Box>
        </Box>

        {draft && (
          <Box component="section" sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 2, p: 2.5 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              This matrix was <b>drafted by AI</b> from {sourceName ? <i>{sourceName}</i> : 'your upload'}. Review and edit
              every field before saving — you are the final reviewer.
            </Alert>
            <Typography variant="h2" sx={{ fontSize: '1.15rem', mb: 2 }}>
              2. Review the proposed matrix
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '200px 1fr' }, gap: 2, alignItems: 'start', mb: 3 }}>
              <TextField
                select
                label="Bar (stage to meet)"
                size="small"
                value={draft.bar}
                onChange={(e) => setDraft((d) => (d ? { ...d, bar: Number(e.target.value) as Stage } : d))}
              >
                {STAGES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s} · {STAGE_NAMES[s]}
                  </MenuItem>
                ))}
              </TextField>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Required concepts
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  Tick the concepts a student must reach the bar on for this unit.
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {draft.concepts.map((c) => (
                    <FormControlLabel
                      key={c.id}
                      control={
                        <Checkbox
                          size="small"
                          checked={draft.required.includes(c.id)}
                          onChange={() => toggleRequired(c.id)}
                        />
                      }
                      label={c.name || c.id}
                    />
                  ))}
                </Box>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {draft.concepts.map((c) => (
                <Box key={c.id} sx={{ border: `1px solid ${brand.borderLight}`, borderRadius: 2, p: 2, bgcolor: brand.bg }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                    <TextField
                      label="Concept name"
                      size="small"
                      value={c.name}
                      onChange={(e) => updateConcept(c.id, { name: e.target.value })}
                      sx={{ flex: 1, minWidth: 220, bgcolor: '#fff' }}
                    />
                    {c.csta && <Chip size="small" variant="outlined" label={c.csta} />}
                    {draft.required.includes(c.id) && <Chip size="small" color="primary" label="Required" />}
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 1.5 }}>
                    {DESCRIPTOR_KEYS.map((key) => (
                      <TextField
                        key={key}
                        label={`Stage ${key} · ${STAGE_NAMES[Number(key) as Stage]}`}
                        size="small"
                        multiline
                        minRows={2}
                        value={c.descriptors[key]}
                        onChange={(e) => updateDescriptor(c.id, key, e.target.value)}
                        sx={{ bgcolor: '#fff' }}
                      />
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 3, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon />}
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? 'Saving…' : 'Save matrix'}
              </Button>
              <Button onClick={() => setDraft(null)} disabled={saving} sx={{ color: brand.charcoal }}>
                Discard draft
              </Button>
            </Box>
          </Box>
        )}

        {unitId && <SavedMatrix saved={saved} />}
      </Container>
    </Box>
  );
}

function SavedMatrix({ saved }: { saved: SavedCurriculum | null }) {
  return (
    <Box component="section" sx={{ bgcolor: '#fff', border: `1px solid ${brand.borderLight}`, borderRadius: 2, p: 2.5 }}>
      <Typography variant="h2" sx={{ fontSize: '1.15rem', mb: 0.5 }}>
        Currently saved matrix
      </Typography>
      {!saved || 'proposed' in saved ? (
        <Typography variant="body2" color="text.secondary">
          No saved matrix for this unit yet.
        </Typography>
      ) : (
        <>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
            <Chip size="small" label={`Bar: ${saved.bar} · ${STAGE_NAMES[saved.bar]}`} />
            <Chip size="small" variant="outlined" label={`${saved.concepts.length} concepts`} />
            <Chip size="small" variant="outlined" label={`${saved.requiredConcepts.length} required`} />
            {saved.sourceName && <Chip size="small" variant="outlined" label={`Source: ${saved.sourceName}`} />}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {saved.concepts.map((c) => (
              <Box key={c.id}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {c.name}
                  {saved.requiredConcepts.includes(c.id) ? ' · required' : ''}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Meeting: {c.descriptors['2']}
                </Typography>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
