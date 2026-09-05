# Explainer Studio — build log

## Project

A single-topic explainer-video system for short educational lessons, using source-grounded scripts, consistent illustrated scenes, narration, and frame review.

- Repository: https://github.com/Avinash1286/explainer-studio
- Live foundation: https://wooden-pheasant-677.convex.site
- Demo recording: not recorded yet.
- Event: https://www.convex.dev/hackathons/all-gas
- First implementation session in this repository: September 5, 2026. The new repository was created from scratch after the reference-video planning work; commit history records actual implementation. This does not attest to the participant's personal eligibility or registration.

## Current working functionality

Save a lesson brief, choose duration and audience, revisit it in the same browser, and cancel it. Convex persists the data and updates the UI. The app currently does not generate videos.

Actual dependencies used: Next.js, TypeScript, React, Convex database/functions/scheduler, Convex static hosting and rate limiter, Lucide icons, bundled fonts, and a Node heartbeat-worker foundation. Convex Workflow is installed but not yet used for generation.

## Planned model and sponsor roles

| Service | Intended role | Current integration status |
|---|---|---|
| Convex | Authoritative state, jobs, realtime UI, storage, workflow, vectors | Database/functions/hosting/rate limiting live; generation workflow and vectors pending |
| NVIDIA NIM | Primary structured text planning | Pending credentials and qualification |
| Cloudflare Workers AI | Qualified text backup; pinned icon embeddings | Pending credentials and qualification |
| Firecrawl | Retrieve research evidence | Pending |
| Kokoro 82M / Zerops | Self-hosted speech and media workers | Worker heartbeat scaffold; synthesis and runtime deployment pending |
| OpenMoji | Licensed illustration assets | Planned; no OpenMoji asset bundled yet |
| OpenAI | Review real rendered frames and gate repairs/publication | Pending |
| AgentMail | Opt-in completion delivery and delivery status | Pending |

## September 5, 2026 — foundation

Built the responsive static studio, anonymous workspace capabilities with server-side hashing, validated idempotent brief creation, indexed ownership checks, scheduled expiry, rate limits, cancellation, and authenticated heartbeat protocol. Added separate Convex development/production deployments and static frontend hosting. Added TypeScript, lint, backend tests, build scripts, and CI.

Validation: 12 isolated backend tests passed locally; production build passed; desktop/mobile UI inspected; real cloud-backed save, reload, and cancellation exercised. The local heartbeat worker authenticated successfully against cloud development. No media benchmark or provider quality claim is made.

Publication: implementation commit `6182229` was pushed to the public repository. The production static deployment includes asset license notices and the production Convex URL (no development URL in its client chunks). GitHub Actions run [33956613116](https://github.com/Avinash1286/explainer-studio/actions/runs/33956613116) could not start: GitHub reported an account lock due to a billing issue. This is an external CI blocker; it is not recorded as a passing CI run.

A separate clean checkout then passed dependency installation, TypeScript, lint, all 12 tests, static frontend build, and worker build without local credentials or preexisting caches. See `docs/foundation-validation.md` for environment and limits.

Development tooling: Codex used for implementation. Official Convex agent guidance installed through `convex ai-files install`; generated guidance is recorded in the repository. The separate organizer hackathon log skill has not yet been installed; this file is maintained directly from observed work.

## Remaining before submission

H0 service qualification, Zerops media benchmark, full H1–H4 generation/review/evaluation, sponsor integrations, demo, actual user feedback, participant eligibility/registration checks, social post, and event submission. No test emails, social messages, or submission have been sent. See `PHASES.md` and `plan.md` for gates; an installed package is not evidence of a working sponsor integration.
