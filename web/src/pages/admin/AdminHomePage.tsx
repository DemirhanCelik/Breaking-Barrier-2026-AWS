import { Link as RouterLink } from 'react-router-dom';
import { Box, Container, Typography } from '@mui/material';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { brand } from '../../theme';
import { AdminHeader } from './AdminHeader';

const CARDS = [
  {
    to: '/admin/appointments',
    label: 'Appointments',
    icon: GroupsOutlinedIcon,
    accent: brand.teal,
    description: 'Pair teachers with students for a unit so the right adults can support the right learners.',
  },
  {
    to: '/admin/review',
    label: 'Review queue',
    icon: FactCheckOutlinedIcon,
    accent: brand.purple,
    description: 'Approve or reject AI-drafted practice before it reaches any student. People make the final call.',
  },
  {
    to: '/admin/curriculum',
    label: 'Curriculum upload',
    icon: UploadFileOutlinedIcon,
    accent: brand.orange,
    description: 'Upload a unit document, review the AI-extracted concept matrix, then save it for the school.',
  },
];

/** Admin landing. Links only to admin workflows, never to student-progress views. */
export function AdminHomePage() {
  return (
    <Box sx={{ flex: 1 }}>
      <AdminHeader
        eyebrow="Administration"
        title="Admin workspace"
        subtitle="Set up the people, the curriculum, and the content that power every classroom."
      />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h2" sx={{ mb: 0.5 }}>
          What would you like to set up?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          These tools manage accounts and curriculum. Student learning progress stays with teachers.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2.5 }}>
          {CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <Box
                key={card.to}
                component={RouterLink}
                to={card.to}
                sx={{
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                  p: 3,
                  bgcolor: '#fff',
                  borderRadius: 3,
                  border: `1px solid ${brand.borderLight}`,
                  transition: 'box-shadow 120ms, transform 120ms, border-color 120ms',
                  '&:hover': {
                    borderColor: card.accent,
                    boxShadow: '0 6px 20px rgba(24,46,48,0.06)',
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: `${card.accent}22`,
                    color: card.accent,
                  }}
                >
                  <Icon />
                </Box>
                <Typography variant="h3">{card.label}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                  {card.description}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: card.accent, fontWeight: 700 }}>
                  Open
                  <ChevronRightIcon fontSize="small" />
                </Box>
              </Box>
            );
          })}
        </Box>
      </Container>
    </Box>
  );
}
