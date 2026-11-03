/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'mock' (default, in-browser demo API) or 'http' (Rails API tier). */
  readonly VITE_API_MODE?: 'mock' | 'http';
  /** Base URL of the Rails API when VITE_API_MODE=http. */
  readonly VITE_API_URL?: string;
  /** 'true' shows the demo menu in HTTP mode (backend must run AUTH_MODE=demo). */
  readonly VITE_DEMO_CONTROLS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
