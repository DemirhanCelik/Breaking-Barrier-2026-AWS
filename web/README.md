# CodeAI Adaptive Lesson: frontend

React 18 + MUI 7 + TypeScript (Vite). Implements the student lesson and the teacher-only attainment view from the BRD and the design doc.

## Run locally

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build to dist/
```

Requires Node 20.19 or newer.

## API modes

| `VITE_API_MODE` | Behavior |
|---|---|
| `mock` (default) | In-browser mock of the Rails API with synthetic users and data, stored in `localStorage`. |
| `http` | Calls the Rails API at `VITE_API_URL`. |

Sign-in in `http` mode (`VITE_AUTH_MODE`):

| `VITE_AUTH_MODE` | Behavior |
|---|---|
| `demo` (default) | Pick a synthetic user; sent as `X-Demo-User`. Backend must run `AUTH_MODE=demo`. |
| `cognito` | Email + password against Amazon Cognito (`VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_REGION`); the ID token is sent as a Bearer JWT. With `VITE_DEMO_PASSWORD` set, the page also shows one-click demo accounts (created by `scripts/seed-cognito-demo.sh`). That password ships in the bundle, so it is public by design. |

The contract lives in `src/api/types.ts` (DTOs) and `src/api/httpApi.ts` (endpoint paths). The Rails team should match these or update them.

## What maps to what

| Requirement | Where |
|---|---|
| FR1 diagnostic placement | `pages/student/DiagnosticView.tsx`, `api/mock/engine.ts` `placeFromDiagnostic` |
| FR2 roadmap coverage | `engine.ts` `buildRoadmap`, teacher trace "Roadmap from here" |
| FR3/FR4 validation | `engine.ts` `evaluate` (deterministic probes only; Bedrock rubric eval is not simulated) |
| FR5 deterministic routing, NFR4 | `engine.ts` `route`, teacher trace "Why each step was chosen" |
| FR6 optional Stage 3 | `pages/student/DepthChoiceView.tsx` |
| FR8 assistant on failure | `pages/student/AssistantDrawer.tsx` (scripted hints in mock mode) |
| FR9 project | level `p1` |
| FR10 fallback | `mockApi.ts` fallback mode; demo menu "Simulate validation failure" |
| FR11 / NFR1 filtering | `engine.ts` `filterText` (stand-in for Bedrock Guardrails, fail-closed) |
| FR12 teacher view | `pages/teacher/*` |
| FR13 backstage | student DTOs carry no stage/score fields; teacher endpoints return 403 to students |

`api/mock/engine.ts` is the reference implementation of the routing rules, written as pure functions so the Rails port can be checked against it.

## Content status

All curriculum in `src/api/mock/curriculum.ts` is synthetic and illustrative: concepts, Stage descriptors, levels, probes, and CSTA mappings. Teaching & Learning must replace and approve it (FR7).
