# Foundation validation — September 5, 2026

## Automated checks

`npm run check` passed with TypeScript, ESLint, twelve Vitest/convex-test tests, Next.js static export, and the Node worker bundle. Tests require no external credentials.

The backend cases cover normalized brief input, workspace isolation, missing/malformed capabilities, idempotent creation, request-key collisions, invalid inputs, cancellation, quota accounting, bounded global queue capacity, session expiry, honest health state, and heartbeat authentication/validation.

## Browser checks

The local application was tested against the dedicated cloud development deployment. A brief was saved through the UI, survived a reload at its selected-job URL, and was cancelled through the UI. Desktop and 390 × 844 mobile views were inspected. No horizontal overflow or browser runtime errors were observed in the checked flow.

The public static frontend was opened in a fresh browser session, saved a different brief through the production backend, and retained that brief after a reload. The production health endpoint returned `generationEnabled: false`, matching the interface. These checks cover the foundation, not video generation or accessibility certification.

## Worker smoke check

The bundled Node worker ran locally against the real cloud development deployment using a generated, ignored credential configured in Convex. Its authenticated heartbeat succeeded, and `/health` returned `ready: true`, `capabilities: ["heartbeat"]`, and `renderingReady: false`. This verifies the network/authentication contract; it is not a Zerops deployment or media benchmark.

## Limitations

- Anonymous capability workspaces; no account recovery or cross-device access.
- Five creations per workspace per UTC day, fifty globally, twenty queued briefs maximum. Cancellation does not refund creation quota. These are initial controls, not comprehensive anti-abuse protection.
- Worker registration supports heartbeat only. No synthesis, renderer, task lease, artifact upload, or Zerops media benchmark has passed yet.
- Provider configuration checks report presence only. No paid model or research integration has been exercised.
- Workflow is installed but not connected to brief creation. Saved briefs will not start generating until a later implemented flow explicitly does so.
