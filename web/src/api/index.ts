import type { ApiClient, DemoControls } from './client';
import { HttpApiClient } from './httpApi';
import { MockApiClient } from './mock/mockApi';

const mode = import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock';

function create(): ApiClient & DemoControls {
  if (mode === 'http') {
    const baseUrl = import.meta.env.VITE_API_URL;
    if (!baseUrl) throw new Error('VITE_API_URL must be set when VITE_API_MODE=http');
    return new HttpApiClient(baseUrl);
  }
  return new MockApiClient();
}

export const api = create();

/** Demo menu: always in mock mode; in HTTP mode only when VITE_DEMO_CONTROLS=true (backend AUTH_MODE=demo). */
export const demoControls: DemoControls | null =
  mode === 'mock' || import.meta.env.VITE_DEMO_CONTROLS === 'true' ? api : null;

export * from './types';
export type { ApiClient, DemoControls } from './client';
