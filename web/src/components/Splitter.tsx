import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Box } from '@mui/material';
import { brand } from '../theme';

/**
 * A pane size (percent) that the student can drag, remembered per browser.
 * Wrapped in try/catch: storage can be unavailable (private mode).
 */
export function usePaneSize(key: string, initial: number, min = 20, max = 80) {
  const [size, setSize] = useState(() => {
    try {
      const v = Number(localStorage.getItem(`codeai-pane-${key}`));
      return v >= min && v <= max ? v : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: number) => {
      const clamped = Math.min(max, Math.max(min, v));
      setSize(clamped);
      try {
        localStorage.setItem(`codeai-pane-${key}`, String(clamped));
      } catch {
        // Storage unavailable: the size lasts for this page only.
      }
    },
    [key, min, max],
  );
  return [size, set, min, max] as const;
}

/**
 * Drag handle between two panes. Pointer drag sets the first pane's size as a
 * percent of `container`; arrow keys move it in 2% steps, Home/End jump to the
 * limits (WAI-ARIA window splitter pattern). Double-click resets.
 */
export function Splitter({
  container,
  axis,
  value,
  min,
  max,
  onChange,
  onReset,
  label,
  fromEnd = false,
}: {
  container: RefObject<HTMLElement>;
  axis: 'x' | 'y';
  /** The value is the size of the pane AFTER the handle (a right-hand panel). */
  fromEnd?: boolean;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  onReset: () => void;
  label: string;
}) {
  const dragging = useRef(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current || !container.current) return;
      const r = container.current.getBoundingClientRect();
      const pct = axis === 'x' ? ((e.clientX - r.left) / r.width) * 100 : ((e.clientY - r.top) / r.height) * 100;
      onChange(fromEnd ? 100 - pct : pct);
    };
    const up = () => {
      dragging.current = false;
      setActive(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [axis, container, onChange, fromEnd]);

  const horizontal = axis === 'y'; // a horizontal bar resizes rows

  return (
    <Box
      role="separator"
      aria-label={label}
      aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        setActive(true);
        document.body.style.userSelect = 'none';
        document.body.style.cursor = horizontal ? 'row-resize' : 'col-resize';
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const back = horizontal ? 'ArrowUp' : 'ArrowLeft';
        const fwd = horizontal ? 'ArrowDown' : 'ArrowRight';
        const step = fromEnd ? -2 : 2;
        if (e.key === back) onChange(value - step);
        else if (e.key === fwd) onChange(value + step);
        else if (e.key === 'Home') onChange(min);
        else if (e.key === 'End') onChange(max);
        else return;
        e.preventDefault();
      }}
      sx={{
        display: { xs: 'none', md: 'flex' },
        alignItems: 'center',
        justifyContent: 'center',
        cursor: horizontal ? 'row-resize' : 'col-resize',
        bgcolor: active ? brand.purple : brand.border,
        transition: 'background-color 120ms',
        touchAction: 'none',
        zIndex: 2,
        '&:hover, &:focus-visible': { bgcolor: brand.purple, outline: 'none' },
        '&::after': {
          content: '""',
          width: horizontal ? 36 : 3,
          height: horizontal ? 3 : 36,
          borderRadius: 2,
          bgcolor: 'rgba(255,255,255,0.9)',
        },
      }}
    />
  );
}
