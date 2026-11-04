import { useEffect, useRef, useState } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { brand } from '../../theme';

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/**
 * Drag-and-drop code ordering (a Parsons problem). Lines keep their indentation;
 * students only choose the order. Arrow buttons give a keyboard and switch-access
 * alternative to dragging. Reports the lines, in order, joined by newlines.
 */
export function ParsonsEditor({
  lines,
  disabled,
  onChange,
}: {
  lines: string[];
  disabled?: boolean;
  onChange: (response: string) => void;
}) {
  const [order, setOrder] = useState(() => lines.map((text, id) => ({ id, text })));
  const dragFrom = useRef<number | null>(null);
  const [announce, setAnnounce] = useState('');

  useEffect(() => onChange(order.map((l) => l.text).join('\n')), [order, onChange]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    setOrder((o) => {
      const next = [...o];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setAnnounce(`Moved "${order[from].text.trim()}" to position ${to + 1} of ${order.length}.`);
  };

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">
        Drag the lines, or use the arrows, until the program works from top to bottom.
      </Typography>
      <Box
        component="ol"
        aria-label="Program lines"
        sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}
      >
        {order.map((line, i) => (
          <Box
            component="li"
            key={line.id}
            draggable={!disabled}
            onDragStart={() => (dragFrom.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom.current !== null) move(dragFrom.current, i);
              dragFrom.current = null;
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1,
              py: 0.5,
              borderRadius: 1.5,
              border: `1px solid ${brand.border}`,
              bgcolor: '#fff',
              cursor: disabled ? 'default' : 'grab',
              '&:hover': disabled ? {} : { borderColor: brand.purple, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
            }}
          >
            <DragIndicatorIcon sx={{ color: '#9aa3ab' }} aria-hidden />
            <Typography sx={{ color: '#9aa3ab', fontFamily: MONO, fontSize: 13, minWidth: 18 }} aria-hidden>
              {i + 1}
            </Typography>
            <Box
              component="code"
              sx={{ flex: 1, fontFamily: MONO, fontSize: 15, whiteSpace: 'pre', overflowX: 'auto' }}
            >
              {line.text}
            </Box>
            <Tooltip title="Move up">
              <span>
                <IconButton
                  size="small"
                  aria-label={`Move line "${line.text.trim()}" up`}
                  disabled={disabled || i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  <ArrowUpwardIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Move down">
              <span>
                <IconButton
                  size="small"
                  aria-label={`Move line "${line.text.trim()}" down`}
                  disabled={disabled || i === order.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  <ArrowDownwardIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        ))}
      </Box>
      <Box
        role="status"
        aria-live="polite"
        sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
      >
        {announce}
      </Box>
    </Box>
  );
}

/**
 * Fill-in-the-blank code: each ____ in the code becomes a small input. Reports
 * {"blanks": [...]} once every blank has something in it, otherwise "".
 */
export function FillEditor({
  code,
  disabled,
  onChange,
}: {
  code: string;
  disabled?: boolean;
  onChange: (response: string) => void;
}) {
  const parts = code.split('____');
  const [values, setValues] = useState<string[]>(() => parts.slice(1).map(() => ''));

  useEffect(
    () => onChange(values.every((v) => v.trim()) ? JSON.stringify({ blanks: values.map((v) => v.trim()) }) : ''),
    [values, onChange],
  );

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">
        Type in each blank. Read the whole program first.
      </Typography>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 2,
          bgcolor: '#fff',
          border: `1px solid ${brand.border}`,
          borderRadius: 1.5,
          fontFamily: MONO,
          fontSize: 15,
          lineHeight: '30px',
          whiteSpace: 'pre-wrap',
          overflowX: 'auto',
        }}
      >
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 && (
              <Box
                component="input"
                aria-label={`Blank ${i + 1}`}
                value={values[i]}
                disabled={disabled}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))
                }
                sx={{
                  fontFamily: MONO,
                  fontSize: 15,
                  width: `${Math.max(values[i].length, 4) + 2}ch`,
                  px: 0.5,
                  mx: 0.25,
                  border: 'none',
                  borderBottom: `2px solid ${brand.purple}`,
                  bgcolor: '#f3effc',
                  borderRadius: '4px 4px 0 0',
                  outline: 'none',
                  '&:focus': { bgcolor: '#e9e1fb' },
                }}
              />
            )}
          </span>
        ))}
      </Box>
    </Box>
  );
}
