/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'mock' (default, in-browser demo API) or 'http' (Rails API tier). */
  readonly VITE_API_MODE?: 'mock' | 'http';
  /** Base URL of the Rails API when VITE_API_MODE=http. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
