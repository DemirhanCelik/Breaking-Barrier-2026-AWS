import type { ApiClient, DemoControls } from './client';
import { HttpApiClient } from './httpApi';
import { MockApiClient } from './mock/mockApi';

const mode = import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock';

function create(): ApiClient & Partial<DemoControls> {
  if (mode === 'http') {
    const baseUrl = import.meta.env.VITE_API_URL;
    if (!baseUrl) throw new Error('VITE_API_URL must be set when VITE_API_MODE=http');
    return new HttpApiClient(baseUrl);
  }
  return new MockApiClient();
}

export const api = create();

export const demoControls: DemoControls | null =
  api instanceof MockApiClient ? api : null;

export * from './types';
export type { ApiClient, DemoControls } from './client';
