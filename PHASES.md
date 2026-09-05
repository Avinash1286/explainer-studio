# Implementation phases

The detailed H0–H6 acceptance gates remain in `plan.md`, section 11. This status file separates completed work from planned capabilities.

| Milestone | Status | Evidence / next gate |
|---|---|---|
| H0a: application foundation | Implemented | Public static app; real Convex create/list/cancel; ownership and quotas; worker heartbeat contract; automated checks and browser verification. |
| H0b: external service and media qualification | Pending | Configure and verify NVIDIA, Cloudflare, Firecrawl, OpenAI, AgentMail; provision the intended inbox; deploy and benchmark Kokoro/rendering on Zerops; finish official hackathon log integration. |
| H1: original rendered fixture | Next build milestone | Three scene layouts, licensed assets, Kokoro narration/timing, Remotion/FFmpeg, Convex media leases, upload and recovery. A playable 20–30-second original fixture is the exit gate. |
| H2: topic to complete explainer | Pending | Real research, structured planning, icon retrieval, scene compilation, 60–90-second result, qualified provider fallback. |
| H3: review, revision, delivery | Pending | OpenAI frame review, bounded repair, targeted revision, opt-in verified AgentMail delivery. |
| H4: evaluation | Pending | Five unseen topics, real user trials, failure/recovery and access checks. |
| H5: release evidence | Pending | Reproducible setup, final licenses, recorded demo, social/submission draft. |
| H6: submission | Pending | Owner-authorized social publishing and submission; real receipt recorded. |

## H0a acceptance evidence

- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` passed locally; 12 backend tests.
- Browser: save a lesson, reload the address, observe persisted data, cancel, and observe realtime cancelled state.
- Browser: desktop and 390-pixel mobile layout inspected; no browser runtime errors observed.
- Public Convex production deployment: `wooden-pheasant-677`; separate development deployment: `lovely-dalmatian-395`.
- Bundled local worker completed an authenticated heartbeat against cloud development; its health endpoint reported ready with heartbeat-only capability.
- `generationEnabled: false` is intentional. No placeholder video is presented as a generated result.

## Next implementation work

1. Qualify the Zerops Ubuntu runtime for Python 3.12, Kokoro, Chromium and FFmpeg. Record an actual synthesis/render benchmark.
2. Define a versioned scene schema and implement process, comparison, and relationship layouts with draw-then-fill animation.
3. Add 20–30 licensed OpenMoji assets/compositions with attribution metadata and a deterministic asset manifest.
4. Implement Convex media task leases, fencing, cancellation, artifact upload, and retry/recovery.
5. Generate and play a 20–30-second fixture, then validate frame order, label readability, narration timing, and interrupted-worker recovery.

Model-provider qualification can proceed alongside H1 after server-side credentials are configured. H0 as originally planned is **not complete** until its external-service and media benchmark gates pass. Each milestone should end with a tested commit, GitHub push, concise completion report, and the next gate.
