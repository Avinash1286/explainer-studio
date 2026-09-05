# H1 — narrated animation and media execution

The media phase adds an explicitly labelled **scripted demo**, not free-text generation. The fixture is `plant-energy-v1`: three original boards explaining how plants turn light into food. The public UI starts a fresh render; the worker does not copy a canned MP4 into the result.

## Components

- `packages/contracts/scene.ts`: versioned Zod scene/project contract with bounded labels, narration, nodes, and scene count.
- `packages/contracts/fixture.ts`: manually written fixture, source reference, icon choices, and narration cue words.
- `video/composition.tsx`: process, comparison, and relationship layouts. Icons trace before their color layer appears; narration, labels, and captions share a frame timeline.
- `workers/tts/synthesize.py`: CPU Kokoro 82M, `af_heart`, speed 0.9, 24 kHz scene WAVs, predicted token timings, and synthesis metrics.
- `workers/media/render.ts`: validates the fixture, compiles audio/scene timing, bundles Remotion, renders H.264/AAC, and produces poster, WebVTT, project/transcript/sources, and benchmark data.
- `convex/media.ts`: session-owned demo creation, queue, leases, attempt fencing, renewal, recovery, upload registration, artifact validation, atomic publication, and abandoned-upload collection.
- `workers/media/index.ts`: one render at a time, renewable lease, cancellation signal, upload, idempotent completion retry, and bounded recovery after failed attempts.

## Local reproduction

Use Node 22.18+ and Python 3.12. The source lives at the repository root.

```sh
npm ci
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu
uv pip install --python .venv/bin/python -r workers/tts/requirements.txt
npm run build:worker
npm run render:fixture
node scripts/verify-render.mjs
```

On Windows use `.venv/Scripts/python.exe` for the two install commands. The renderer selects that path automatically on Windows; override with `PYTHON_BIN` when needed. First synthesis downloads model/voice weights and the English spaCy model. First rendering downloads Chrome Headless Shell. Those downloads are not representative of steady-state latency.

Artifacts are written to ignored `runs/fixture/`. To run the queue worker locally, configure `.env.worker` with a matching Convex `WORKER_AUTH_TOKEN`, `CONVEX_SITE_URL`, and a unique `WORKER_ID`, then run `npm run worker`. A production token must not be reused against development.

## Zerops deployment

The project uses a dedicated `explainer-studio` Zerops project. `zerops-import.yaml` defines a single Ubuntu service with two shared CPUs, 4 GB RAM, and 10 GB disk. Provisioning secrets are supplied separately in an ignored populated manifest. The application remains hosted on Convex.

`zerops.yaml` builds Node 22 code, includes renderer dependencies/browser, and prepares the Python CPU environment, eSpeak, FFmpeg, browser libraries, and cached Kokoro voice/model. Readiness requires successful Convex heartbeat. The verified runtime is Ubuntu 22.04 (Jammy), Node 22.23.1 and Python 3.12.11, installed through pinned uv 0.8.22. The import type is Ubuntu 24.04; the Node runtime base selects a different userspace. Runtime libraries use Jammy package names, including `libasound2`.

```sh
zcli push mediaworker -P YOUR_PROJECT_ID --setup mediaworker --zerops-yaml-path zerops.yaml
```

`.deployignore` patterns are anchored to the root. An unanchored `out/` would remove dependency internals such as `fast-glob/out`, breaking the deployed renderer.

## Recovery and access

Tasks have a 90-second lease, renewed every 15 seconds. Every attempt receives a monotonically increasing fence. Expired/abandoned work is requeued until three attempts have failed. A stale worker cannot renew, obtain a fresh upload URL, or publish. Cancellation is checked before renewal and publication. The renderer receives an abort signal; stopping the worker aborts in-flight work.

Recovery restarts the immutable fixture from the beginning. It does not yet reuse prior scene WAVs or partially rendered frames. Those optimizations belong to the later pipeline.

Four distinct registered artifacts with expected MIME types and bounded sizes must be available before publication. A repeated identical completion is accepted; changed payloads are rejected. Registered abandoned uploads are collected after one hour. A crash between storage upload and upload registration can still leave an unregistered object; automated reconciliation of that narrow window is deferred. No broad storage sweep is used because Convex also hosts the frontend in storage.

Result lookup checks the owning browser session. The returned storage URLs are bearer links: anyone holding a copied link can access the artifact. This is not signed-URL expiry or private streaming. Browser workspace expiry/recovery limitations from H0 still apply.

## Validation

- 21 Convex tests cover the foundation plus claim deduplication, ownership, cancellation, stale attempts, completion validation, upload collection, explicit abandonment, and the three-attempt ceiling.
- TypeScript, ESLint, Next static export, and Node bundles pass.
- Local fixture: 585 frames at 24 fps, 1280 × 720, 24.375 seconds on the composition timeline. MP4 container duration includes a small AAC padding difference.
- Measured warm local run: 61.19 seconds total, 21.03 seconds within the synthesis script, 32.17 seconds in renderer setup/render/poster work. Remaining time includes Python startup/imports and orchestration. This is a single Windows run, not an SLA.
- `verify-render.mjs` checks contiguous scenes, audio fit, valid token/cue bounds, duration, three layouts, and identical PNG bytes when rendering the same frame after out-of-order frame requests.
- Frames from all three layouts were visually inspected. Kokoro timings are model predictions, not independently measured forced alignment; no sub-250 ms accuracy claim is made.
- A live cloud-development smoke completed through the authenticated worker API, atomically published the result, and successfully downloaded MP4, JSON, WebVTT, and poster artifacts. The test source is `scripts/smoke-media.mjs`.

## Live outage exercise

`scripts/simulate-interrupted-worker.mjs` starts a test job and claims it as a simulated worker that never renews. A real worker is then started. The scheduled lease-expiry mutation must requeue the task and the real worker must complete a later attempt. Run this only against an otherwise idle development deployment; it is deliberately separate from credential-free unit tests.

## Production result

The deployed Zerops worker completed production task `jn78j714hbva1sahq17kgfcwk98dvr9e` on attempt 1. Generation took 143.62 seconds for a 24.375-second composition. Synthesis took 61.91 seconds; renderer setup/render/poster work took 69.41 seconds. This excludes deployment, queue wait and final uploads. The model had been warmed during image preparation. Python peak RSS was 1726.64 MiB; whole-container peak was not measured. See `media-benchmark-zerops.json` for exact values and output hash.

The production browser loaded 1280 x 720 video with `readyState = 4`, advanced playback without a media error, loaded all nine WebVTT cues, and returned HTTP 200 for MP4, project JSON and captions. The MP4 container duration was 24.426667 seconds because of audio padding. Desktop and 390-pixel mobile layouts were checked without horizontal overflow or browser runtime errors.

The live outage exercise passed: task `jn79gb46jm9q0e56dk8n6wxapx8dvd7d` was reclaimed after attempt 1 stopped renewing and published by the replacement worker on attempt 2. This exercises actual Convex scheduled recovery and a real renderer; it is separate from the isolated backend tests. `media-recovery-live.json` records the test result.

## Scope boundaries

No Firecrawl research, NIM/Workers AI planning, embedding retrieval, OpenAI visual review, or AgentMail delivery is called in H1. No arbitrary prompt is silently replaced with this fixture. The next phase is H2: research and schema-validated planning that produces new scene data from a topic, with qualified provider fallback.
