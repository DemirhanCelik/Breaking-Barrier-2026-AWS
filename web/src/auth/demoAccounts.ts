import type { SessionUser } from '../api';

/**
 * Synthetic demo accounts provisioned in Cognito by scripts/seed-cognito-demo.sh.
 * Keep in sync with that script and api/app/services/demo_seed.rb. Each Cognito
 * user's preferred_username is the seeded id, which links it to the seeded row.
 * Emails use the reserved .test TLD, so nothing is ever delivered.
 */
export const DEMO_ACCOUNTS: (SessionUser & { email: string })[] = [
  { id: 't-rivera', displayName: 'Ms. Rivera (teacher)', role: 'teacher' },
  { id: 's-ava', displayName: 'Ava M.', role: 'student' },
  { id: 's-ben', displayName: 'Ben O.', role: 'student' },
  { id: 's-chloe', displayName: 'Chloe P.', role: 'student' },
  { id: 's-dev', displayName: 'Dev R.', role: 'student' },
  { id: 's-eli', displayName: 'Eli S.', role: 'student' },
  { id: 's-fay', displayName: 'Fay T.', role: 'student' },
  { id: 's-gus', displayName: 'Gus W.', role: 'student' },
].map((u) => ({
  ...u,
  role: u.role as SessionUser['role'],
  email: `${u.id}@demo.codeai.test`,
}));

export const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || '';
