import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';
import { brand, headingFont } from '../theme';

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box
        component="svg"
        viewBox="0 0 32 32"
        sx={{ width: size + 8, height: size + 8 }}
        aria-hidden
      >
        <rect x="1" y="1" width="30" height="30" rx="7" fill={brand.teal} />
        <path d="M12.5 10 7 16l5.5 6" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19.5 10 25 16l-5.5 6" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="16" r="2.4" fill={brand.orange} />
      </Box>
      <Typography component="span" sx={{ fontFamily: headingFont, fontWeight: 700, fontSize: size, letterSpacing: '0.01em', color: '#fff' }}>
        Code<Box component="span" sx={{ color: brand.teal }}>AI</Box>
      </Typography>
    </Box>
  );
}

/** "Bit", the lesson guide. Speaks coaching; never shows scores. */
export function Bit({ size = 52, mood = 'happy' }: { size?: number; mood?: 'happy' | 'thinking' }) {
  return (
    <Box component="svg" viewBox="0 0 64 64" sx={{ width: size, height: size, flexShrink: 0 }} aria-hidden>
      <line x1="32" y1="6" x2="32" y2="14" stroke={brand.charcoal} strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="6" r="4" fill={brand.orange} />
      <rect x="8" y="14" width="48" height="40" rx="14" fill={brand.teal} />
      <rect x="14" y="21" width="36" height="22" rx="9" fill="#fff" />
      {mood === 'happy' ? (
        <>
          <circle cx="24" cy="31" r="3.5" fill={brand.charcoal} />
          <circle cx="40" cy="31" r="3.5" fill={brand.charcoal} />
          <path d="M26 37q6 4 12 0" stroke={brand.charcoal} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <rect x="20.5" y="30" width="7" height="3" rx="1.5" fill={brand.charcoal} />
          <circle cx="40" cy="31" r="3.5" fill={brand.charcoal} />
          <path d="M27 38h10" stroke={brand.charcoal} strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
      <rect x="4" y="28" width="5" height="12" rx="2.5" fill={brand.tealDark} />
      <rect x="55" y="28" width="5" height="12" rx="2.5" fill={brand.tealDark} />
    </Box>
  );
}

export function SpeechBubble({
  children,
  tone = 'default',
  mood,
  sx,
  role,
}: {
  children: ReactNode;
  tone?: 'default' | 'coach' | 'caution';
  mood?: 'happy' | 'thinking';
  sx?: SxProps<Theme>;
  role?: string;
}) {
  const border = tone === 'coach' ? brand.teal : tone === 'caution' ? brand.orange : brand.borderLight;
  const bg = tone === 'coach' ? '#eff8f3' : tone === 'caution' ? '#fff7e6' : '#fff';
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', ...sx }} role={role}>
      <Bit size={48} mood={mood ?? (tone === 'default' ? 'happy' : 'thinking')} />
      <Box
        sx={{
          position: 'relative',
          flex: 1,
          bgcolor: bg,
          border: `1px solid ${border}`,
          borderRadius: 2,
          px: 2,
          py: 1.5,
          '&::before': {
            content: '""',
            position: 'absolute',
            left: -9,
            top: 16,
            width: 14,
            height: 14,
            bgcolor: bg,
            borderLeft: `1px solid ${border}`,
            borderBottom: `1px solid ${border}`,
            transform: 'rotate(45deg)',
          },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

/** Uppercase strip header used on lab panes and teacher panels. */
export function PaneHeader({ title, right, dark }: { title: string; right?: ReactNode; dark?: boolean }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minHeight: 52,
        px: 2,
        bgcolor: dark ? brand.slate : '#fff',
        color: dark ? '#fff' : brand.charcoal,
        borderBottom: `1px solid ${dark ? brand.slate : brand.borderLight}`,
      }}
    >
      <Typography variant="overline" noWrap sx={{ flex: 1, minWidth: 0 }}>
        {title}
      </Typography>
      {right}
    </Box>
  );
}

const AVATAR_COLORS = [brand.teal, brand.purple, brand.orange, '#3d9b5f', '#d65a7a', '#4a7fd1', '#8a6d3b'];

export function Initials({ name, size = 40 }: { name: string; size?: number }) {
  const letters = name
    .replace(/\(.*\)/, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const color = AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: color,
        color: color === brand.orange ? brand.charcoal : '#fff',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        fontSize: size * 0.38,
        flexShrink: 0,
      }}
      aria-hidden
    >
      {letters}
    </Box>
  );
}
