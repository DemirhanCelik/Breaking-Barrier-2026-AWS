import type { SessionUser } from '../api';

/**
 * Synthetic demo accounts provisioned in Cognito by scripts/seed-cognito-demo.sh.
 * Keep in sync with that script and api/app/services/demo_seed.rb. Each Cognito
 * user's preferred_username is the seeded id, which links it to the seeded row.
 * Emails are <name>@demo.test (reserved .test TLD, so nothing is ever delivered).
 */
export const DEMO_ACCOUNTS: (SessionUser & { email: string })[] = [
  { id: 'Tanushree-admin', displayName: 'Tanushree Saraf', role: 'admin', email: 'tanushree-admin@demo.test' },
  { id: 't-rivera', displayName: 'Ms. Rivera (teacher)', role: 'teacher' },
  { id: 's-hithesh', displayName: 'Hithesh', role: 'student' },
  { id: 's-tanushree', displayName: 'Tanushree', role: 'student' },
  { id: 's-demirhan', displayName: 'Demirhan', role: 'student' },
  { id: 's-tzuhan', displayName: 'Tzuhan', role: 'student' },
  { id: 's-hithesh1', displayName: 'Hithesh1', role: 'student' },
  { id: 's-tanushree1', displayName: 'Tanushree1', role: 'student' },
  { id: 's-demirhan1', displayName: 'Demirhan1', role: 'student' },
  { id: 's-tzuhan1', displayName: 'Tzuhan1', role: 'student' },
].map((u) => ({
  id: u.id,
  displayName: u.displayName,
  role: u.role as SessionUser['role'],
  // Default email derivation for the t-/s- demo ids; honor an explicit email
  // (e.g. the admin, whose id has no t-/s- prefix).
  email: (u as { email?: string }).email ?? `${u.id.replace(/^[st]-/, '')}@demo.test`,
}));

export const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || '';
