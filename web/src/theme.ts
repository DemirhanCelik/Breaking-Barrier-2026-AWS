import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: { main: '#0b6e8a' },
    secondary: { main: '#6b4fbb' },
    background: { default: '#f5f7fa' },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    h1: { fontSize: '1.9rem', fontWeight: 700 },
    h2: { fontSize: '1.45rem', fontWeight: 700 },
    h3: { fontSize: '1.15rem', fontWeight: 600 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { border: '1px solid #e1e6ec' } } },
    MuiAppBar: { styleOverrides: { root: { border: 'none' } } },
  },
});
