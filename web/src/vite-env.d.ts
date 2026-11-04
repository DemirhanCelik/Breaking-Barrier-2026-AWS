/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'mock' (default, in-browser demo API) or 'http' (Rails API tier). */
  readonly VITE_API_MODE?: 'mock' | 'http';
  /** Base URL of the Rails API when VITE_API_MODE=http. */
  readonly VITE_API_URL?: string;
  /** 'true' shows the demo menu in HTTP mode (backend AUTH_MODE=demo, or DEMO_CONTROLS=true for teachers). */
  readonly VITE_DEMO_CONTROLS?: string;
  /** 'demo' (X-Demo-User picker, default) or 'cognito' (email + password via Amazon Cognito). */
  readonly VITE_AUTH_MODE?: 'demo' | 'cognito';
  readonly VITE_COGNITO_REGION?: string;
  readonly VITE_COGNITO_CLIENT_ID?: string;
  /** Shared password of the synthetic demo accounts; enables one-click demo sign-in. Public by design. */
  readonly VITE_DEMO_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
