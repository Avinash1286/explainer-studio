# Implementation phases

The detailed H0–H6 acceptance gates remain in `plan.md`, section 11. This status file separates completed work from planned capabilities.

| Milestone | Status | Evidence / next gate |
|---|---|---|
| H0a: application foundation | Implemented | Public static app; real Convex create/list/cancel; ownership and quotas; worker heartbeat contract; automated checks and browser verification. |
| H0b: external service and media qualification | Pending | Media runtime qualified on Zerops. NVIDIA, Cloudflare, Firecrawl, OpenAI and AgentMail account qualification, intended inbox and official hackathon log integration remain pending. |
| H1: original rendered fixture | Next build milestone | Three scene layouts, licensed assets, Kokoro narration/timing, Remotion/FFmpeg, Convex media leases, upload and recovery. A playable 20–30-second original fixture is the exit gate. |
| H2: topic to complete explainer | Pending | Real research, structured planning, icon retrieval, scene compilation, 60–90-second result, qualified provider fallback. |
| H3: review, revision, delivery | Pending | OpenAI frame review, bounded repair, targeted revision, opt-in verified AgentMail delivery. |
| H4: evaluation | Pending | Five unseen topics, real user trials, failure/recovery and access checks. |
| H5: release evidence | Pending | Reproducible setup, final licenses, recorded demo, social/submission draft. |
| H6: submission | Pending | Owner-authorized social publishing and submission; real receipt recorded. |

## H0a acceptance evidence

- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` passed locally; 12 backend tests.
- A separate clean checkout also passed `npm ci` and the complete check without credentials. Hosted GitHub CI is blocked by an account billing lock; its result is not a pass.
- Browser: save a lesson, reload the address, observe persisted data, cancel, and observe realtime cancelled state.
- Browser: desktop and 390-pixel mobile layout inspected; no browser runtime errors observed.
- Public Convex production deployment: `wooden-pheasant-677`; separate development deployment: `lovely-dalmatian-395`.
- Bundled local worker completed an authenticated heartbeat against cloud development; its health endpoint reported ready with heartbeat-only capability.
- `generationEnabled: false` is intentional. No placeholder video is presented as a generated result.

## H1 acceptance evidence

- `npm run check` passed: TypeScript, ESLint, 21 backend tests, Next static export and Node worker bundles.
- Local original fixture: 585 frames, 1280 x 720, 24 fps, 24.375-second timeline; three layout families, predicted Kokoro word timing, burned captions and WebVTT.
- Frame verification passed, including rendering the same frame after out-of-order requests and comparing PNG bytes.
- Production Zerops worker rendered the demo in 143.62 seconds on two shared CPUs / 4 GB RAM. Python TTS peak RSS was 1726.64 MiB; this is not total service memory. See `docs/media-benchmark-zerops.json`.
- Live production browser played the result; MP4, project/source JSON and captions returned HTTP 200. Development smoke also downloaded all four artifacts.
- A simulated worker stopped renewing its lease. Scheduled recovery reassigned the job and a real worker published attempt 2. See `docs/media-recovery-live.json`.
- Scripted demo is explicitly labelled. General topic generation remains disabled.

## Next implementation work: H2

1. Qualify server-side Firecrawl, NVIDIA NIM and Cloudflare Workers AI credentials with actual requests and structured-output/fallback probes.
2. Add a durable Convex research-to-script-to-scenes workflow with persisted evidence, bounded retries and visible progress.
3. Populate a versioned icon embedding index and retrieve licensed icons for generated scene concepts.
4. Compile validated generated projects into the existing media queue; reject unsupported or weakly sourced plans instead of substituting the fixture.
5. Produce and verify a new 60?90-second explainer from a topic, including a deliberately exercised provider rate-limit fallback.

H0 as originally planned is **not complete** until its remaining external-service gates pass. Each milestone ends with a tested commit, GitHub push, completion report and next gate. H3 adds frame review, revision and opt-in delivery after the full generation path works.
