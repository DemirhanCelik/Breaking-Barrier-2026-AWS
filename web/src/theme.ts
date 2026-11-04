import { createTheme } from '@mui/material/styles';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import '@fontsource/figtree/800.css';

/** Shared palette for the learning workspace and teacher overview. */
export const brand = {
  teal: '#21b6a8',
  tealDark: '#087f75',
  tealLight: '#e4f5ef',
  purple: '#7663a5',
  purpleDark: '#5a4b84',
  purpleLight: '#ece8f5',
  orange: '#ffa400',
  orangeDark: '#e08f00',
  charcoal: '#182e30',
  slate: '#3b434c',
  gray: '#5b6770',
  border: '#ccd9d5',
  borderLight: '#e1e8e4',
  bg: '#f5f7f3',
  strip: '#edf2ee',
  editor: '#1e2329',
} as const;

export const headingFont = '"Figtree", sans-serif';

export const theme = createTheme({
  palette: {
    primary: { main: brand.tealDark, light: brand.teal, contrastText: '#fff' },
    secondary: { main: brand.purple, dark: brand.purpleDark, contrastText: '#fff' },
    warning: { main: brand.orange, dark: brand.orangeDark, contrastText: brand.charcoal },
    text: { primary: brand.charcoal, secondary: brand.gray },
    background: { default: brand.bg, paper: '#fff' },
    divider: brand.borderLight,
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Figtree", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontSize: 15,
    body1: { lineHeight: 1.7 },
    body2: { lineHeight: 1.6 },
    h1: { letterSpacing: '-0.045em', fontFamily: headingFont, fontSize: '2.1rem', fontWeight: 700, lineHeight: 1.15 },
    h2: { letterSpacing: '-0.035em', fontFamily: headingFont, fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.2 },
    h3: { fontFamily: headingFont, fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.25 },
    h4: { fontFamily: headingFont, fontSize: '1.05rem', fontWeight: 600 },
    overline: { fontWeight: 700, letterSpacing: '0.08em', fontSize: '0.72rem', lineHeight: 1.6 },
    button: { fontWeight: 700, textTransform: 'none', letterSpacing: 0 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: { body: { WebkitFontSmoothing: 'antialiased' }, '::selection': { background: '#c8eade' }, ':focus-visible': { outline: '3px solid #087f75', outlineOffset: 3 }, '@media (prefers-reduced-motion: reduce)': { '*, *::before, *::after': { transition: 'none !important', animation: 'none !important', scrollBehavior: 'auto !important' } } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, paddingInline: 22, minHeight: 40 },
        sizeLarge: { paddingBlock: 10, fontSize: '1rem' },
        outlined: { borderWidth: 2, '&:hover': { borderWidth: 2 } },
      },
      variants: [
        {
          props: { variant: 'contained', color: 'warning' },
          style: { color: brand.charcoal, '&:hover': { backgroundColor: brand.orangeDark } },
        },
      ],
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { border: `1px solid ${brand.borderLight}` } },
    },
    MuiAppBar: { styleOverrides: { root: { border: 'none' } } },
    MuiDrawer: { styleOverrides: { paper: { border: 'none' } } },
    MuiMenu: { styleOverrides: { paper: { border: `1px solid ${brand.borderLight}` } } },
    MuiTooltip: {
      styleOverrides: { tooltip: { backgroundColor: brand.charcoal, fontSize: '0.8rem', padding: '6px 10px' } },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 700, color: brand.charcoal, backgroundColor: brand.strip },
        root: { borderColor: brand.borderLight },
      },
    },
  },
});
