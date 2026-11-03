import { createTheme } from '@mui/material/styles';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import '@fontsource/figtree/800.css';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';

/**
 * Visual language inspired by CodeAI's production lesson UI: a dark top bar,
 * level-progress bubbles, a split instructions/workspace "lab" layout, teal
 * brand, purple for teacher surfaces, and an orange primary action.
 */
export const brand = {
  teal: '#00adbc',
  tealDark: '#007f8c',
  tealLight: '#d6f3f5',
  purple: '#7665a0',
  purpleDark: '#5a4b84',
  purpleLight: '#ece8f5',
  orange: '#ffa400',
  orangeDark: '#e08f00',
  charcoal: '#292f36',
  slate: '#3b434c',
  gray: '#5b6770',
  border: '#c6cacd',
  borderLight: '#e3e5e7',
  bg: '#f2f3f4',
  strip: '#e7e9eb',
  editor: '#1e2329',
} as const;

export const headingFont = '"Barlow Semi Condensed", "Figtree", sans-serif';

export const theme = createTheme({
  palette: {
    primary: { main: brand.tealDark, light: brand.teal, contrastText: '#fff' },
    secondary: { main: brand.purple, dark: brand.purpleDark, contrastText: '#fff' },
    warning: { main: brand.orange, dark: brand.orangeDark, contrastText: brand.charcoal },
    text: { primary: brand.charcoal, secondary: brand.gray },
    background: { default: brand.bg, paper: '#fff' },
    divider: brand.borderLight,
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: '"Figtree", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontSize: 15,
    h1: { fontFamily: headingFont, fontSize: '2.1rem', fontWeight: 700, lineHeight: 1.15 },
    h2: { fontFamily: headingFont, fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.2 },
    h3: { fontFamily: headingFont, fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.25 },
    h4: { fontFamily: headingFont, fontSize: '1.05rem', fontWeight: 600 },
    overline: { fontWeight: 700, letterSpacing: '0.08em', fontSize: '0.72rem', lineHeight: 1.6 },
    button: { fontWeight: 700, textTransform: 'none', letterSpacing: 0 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: { body: { WebkitFontSmoothing: 'antialiased' } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 4, paddingInline: 18 },
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
