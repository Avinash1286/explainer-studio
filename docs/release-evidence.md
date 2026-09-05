# Release 0.6.0 acceptance evidence

Recorded September 5, 2026. The current release adds an explicit NVIDIA NIM + Cloudflare Workers AI or OpenAI choice. The saved choice follows each lesson through planning, factual review, actual JPEG frame review and scene edits. Both routes retain Firecrawl research, local Kokoro narration and deterministic Remotion rendering. There is no silent fallback between the two choices.

- `npm run check` passed: **109 tests across 13 files**, TypeScript, ESLint, Next.js static export and Node media bundles.
- Tests cover absent keys, model access errors, authentication and quota errors, independent provider readiness, route persistence, ownership, bounded preflight checks, unavailable review/retry behavior and safe asynchronous failure messages. OpenAI Responses calls use strict structured output and record model/response/usage provenance.
- The default OpenAI model is `gpt-5.4-mini`, configurable through server-only `OPENAI_MODEL`. `npm run openai:setup -- --prod` validates model access and installs the server settings. No OpenAI key was available during this release; mocked tests do not establish successful live inference or sponsor usage.
- AgentMail inbox lookup now returns HTTP 200 and matches the configured inbox. A scoped production webhook was registered for sent, delivered and bounced events, and `npm run delivery:setup -- --prod` succeeded. The signing secret is stored only in ignored local configuration and Convex. No email has been sent: a consented recipient verification and receipt of an approved lesson remain acceptance steps.
- Production backend and static frontend deployments succeeded at https://wooden-pheasant-677.convex.site/. `/api/health` returned HTTP 200 with generation enabled. The media runtime remains 0.5.6 because this release changes provider orchestration and UI, not rendering or its protocol.
- Live browser checks verified the default NVIDIA/Cloudflare choice and the OpenAI missing-key toast on selection and submission. Submitting unavailable OpenAI created zero lessons. The selector and toast fit a 390-pixel viewport with no horizontal overflow. A new NVIDIA/Cloudflare lesson retained its route after changing the form choice and reloading the page.
- The public solar example still loads in an independent browser with a 60.053-second 1280×720 video, English captions and five source links.

Full hackathon readiness still requires live OpenAI acceptance, consented email delivery, real user trials, the owner's demo recording, social post, and actual submission receipt. See `hackathon-readiness.md` for the current checklist.

## Historical 0.5.6 acceptance evidence

The remainder preserves the earlier release record. Its old AgentMail configuration failure and NVIDIA/Cloudflare-only restriction describe that release and are superseded by the current 0.6.0 record above.

Recorded September 5, 2026. This report separates implementation, automated checks and actual model output. It is not a claim of perfect factual accuracy or confirmed hackathon eligibility.

## Implemented and checked

All three remaining implementation workstreams are present: robust source-grounded authoring and review; the complete revision/download/share workflow; and deployment, evaluation and recording preparation. AgentMail code is implemented, but live delivery remains externally blocked.

- `npm run check` passed on 0.5.6: 80 tests across 11 files, TypeScript, ESLint, Next static export and Node media bundles.
- Tests cover ownership, quotas, cancellation, stale-worker fencing, provider fallback, exact evidence identity, cue/edge ordering, review coverage, bounded recovery, unchanged scenes, approved-version sharing and revocation.
- Real NVIDIA reasoning caught the distinction between a 27.3-day lunar orbit and a 29.5-day phase cycle; a non-reasoning review had missed it. The bounded reasoning qualification completed in 17 seconds. This is one calibration example, not proof of general accuracy.
- Cloudflare's daily free allocation returned 429 during this session. Actual image review fell back to NVIDIA Nemotron Nano Omni using decoded JPEG bytes. No OpenAI API calls or paid quota upgrades were introduced.
- FFmpeg mastering regression measured the delivered test file at -16.17 LUFS integrated and -1.56 dBTP. The video stream was copied unchanged. Opposing arrow labels and a long word-card label were visually checked after layout fixes.

## Live topic evaluation

These development runs span implementation fixes and retries. They are **not** a frozen-code benchmark, independent user trials, or a first-pass success-rate claim. Earlier failures are retained.

| Topic | Observed outcome | Manual qualification |
|---|---|---|
| Dew on leaves | Failed after revision 2 and bounded recovery | Misleading vapor/container arrows; not a public example |
| Moon phases | Completed revision 3 after automatic repair and one requested edit | Five end boards inspected; orbital-period error corrected; requested scene changed while the other four scenes retained their content |
| Sunlight powering a house | Automated approval at revision 2 | Manual inspection found a misleading house-to-battery relationship; not published |
| Water transport in trees | Failed after bounded repair/recovery | Provider failures; no accepted final result |
| Moving shadows | Failed after review/repair | Unsupported claims and provider failures; not published |
| Floating ice | Planning failed, including its one public retry | NVIDIA timeout and exhausted Cloudflare quota |
| Battery and bulb | Completed revision 1 | Opposing edge-label collision motivated the renderer fix; old clip is not a polished showcase |
| Soap and grease | Completed revision 1 | Four end boards and narration inspected; usable basic explanation, predominantly word cards |
| Wind turbine | Revision 2 rejected after the automatic repair | Initial planning retry and automatic repair recorded; new factual/diagram issues remained, so no public example |
| Metal spoon in tea | Completed revision 1 | Readable but weak concept selection, including an unhelpful “Through” card in an older compiler output; not published |

The mixed results show why saved drafts, bounded recovery and manual inspection matter. Automatic approval is not equivalent to a high-quality demonstration video. The 24-icon catalog and text-card fallback limit visual variety.

## Actual revision and production workflow

- Moon revision 2 to 3 changed scene 4 only; structured comparison of title, narration, nodes, takeaway and connections showed all other scenes unchanged. Its worker reused four cached narration scenes. Media processing took 127.78 seconds for 75 seconds of video.
- A real production solar-cell question completed on Zerops. Initial media processing took 205.95 seconds for 60 seconds of video, with 2617 MiB peak Python TTS RSS. This excludes research, planning, queue and review time.
- Production revision 2 corrected the broad panel-efficiency claim through the actual browser edit form. A second requested edit refined the charge-carrier explanation on worker 0.5.4. Revision 3 passed both reviews and retained the content of the other three scenes.
- An actual production share was created through the UI. A separate browser with no creator token played the 60.053-second file, had a caption track and displayed five source links. Revoking the share through the UI made a fresh request show “Lesson link unavailable.” No email was sent.
- A public example is published only after its exact approved version is manually inspected. Ordinary workspace lessons never appear in the gallery automatically.

## Deployment

- Production: https://wooden-pheasant-677.convex.site/ (Convex frontend, database, workflows and files).
- Development: separate `lovely-dalmatian-395` deployment.
- Zerops `mediaworker` 0.5.4: build/deploy succeeded and authenticated fresh heartbeat confirmed seven capabilities, including protocol-5 text cards.
- GitHub: https://github.com/Avinash1286/explainer-studio . Commit `1104cfd` passed a clean-install Vercel validation deployment. Later release commit verification is recorded below.
- Vercel Hobby Git integration runs `npm run check`; GitHub Actions remains disabled.

## Remaining external requirements

AgentMail inbox access returned HTTP 403. The owner needs a working key/inbox/webhook configuration and must consent to a real recipient verification and delivery test. No inbox or successful email receipt is claimed from variable presence or mocks.

The owner records the under-three-minute demo, gathers real user feedback and posts/submits the final entry. The official event's sponsor-stack criterion names OpenAI, while this project's model stack deliberately excludes it; qualification or scoring requires organizer clarification. See the [official event](https://www.convex.dev/hackathons/all-gas), [demo runbook](demo-runbook.md) and [submission draft](submission-draft.md).

## Final activation record

Production generation is enabled; `/api/health` returns `generationEnabled:true`. The exact approved solar revision 3 is published at https://wooden-pheasant-677.convex.site/lesson/index.html?example=solar-cells . All four end boards were inspected. The gallery and player work in a fresh browser at desktop and 390-pixel mobile width without horizontal overflow. A fresh public Generate-button lesson completed, with its separate manual limitations recorded below.

Release commit `a31a963` passed a clean-install Vercel build: 76 tests, TypeScript, lint, static export and worker bundles. Deployment: https://explainer-studio-checks-lodya2gls-avinash1286s-projects.vercel.app (Ready). The final five-topic fixed-code evaluation is recorded in `release-evaluation.json`; it is separate from the earlier mixed-code runs.

Solar revision 3: 60 seconds, 1440 frames, 273.60 seconds media processing, 2184 MiB peak Python TTS RSS, SHA-256 `2ea97106020fd1e760962e5db542b3565017084d187dd4d1933ce59bb217a506`. Cache was cold after the worker deployment; no production cache-hit claim is made for this revision. EIA, DOE and Wikipedia source links returned HTTP 200; two other source servers timed out on this host's HEAD checks. Their research excerpts remain stored, but current reachability is not claimed.


## Content-first hardening

The initial 0.5.4 fixed-code batch revealed two additional defects: icon-catalog conditioning pulled scripts toward irrelevant objects, and repair prompts omitted the original target scene, causing unnecessary rewrites. The batch is retained as a failed/interrupted evaluation, not a successful release gate. Rain was rejected after its automatic repair; roots reached an unavailable review after repair. Remaining runs were stopped for the correction, with their outcomes retained in the evaluation record.

Release 0.5.5 writes the explanation before choosing natural-language visual concepts, removes per-scene word minimums that encouraged filler, supplies original target scenes to repair, and chooses optional narration closest to the original length. Live text qualification on the existing ice research completed in 22.6 seconds and replaced unrelated sun/leaf/cloud scenes with molecular structure and phase-change explanation. This text-only qualification does not count as a rendered-video pass.

Stopping the superseded batch also exposed a real cancellation bug: the planning workflow can be complete while media remains active. Cancellation now checks workflow status before cancelling it, so a completed planner cannot roll back the media cancellation. A real-workflow regression covers the transition and rejects late worker renewals.

For the 0.5.5 evaluation, the media runtime remained 0.5.4 because those changes were in backend authoring, repair and cancellation. The later renderer-only correction is documented below.

## Final five-topic result

The predeclared five-topic test ran against commit `58e1d09` (backend 0.5.5, media 0.5.4). Both lanes finished. There were **4/5 automated approvals**: salt, refrigerator and metal/wood passed revision 1; loudspeaker passed revision 2 after its one automatic repair. Bicycle failed revision 2 because its 39-second synthesized narration exceeded the old allowed silent-hold range for a 60-second target. No operator recovery or requested edit was used in this batch. The earlier aborted 0.5.4 batch is preserved inside `release-evaluation.json`.

All available final scene boards and scripts were inspected separately. These are mostly explanatory word cards; some labels were weak or broke awkwardly across lines, and an older long heading approached the edge. They are not four polished showcase examples or four real user trials. The separately inspected solar revision 3 remains the sole public example.

Media processing for successful results ranged from 147.88 to 255.80 seconds, excluding research/planning/queue/review. The loudspeaker repair reused three unchanged narration scenes. Development used Windows and production used Linux; timings are not a controlled cross-platform comparison.

The public Generate-button ice lesson also completed revision 1 with a 75-second video on production, proving the public entry flow. Manual inspection rejected its older, irrelevant visual concepts; it is not published. The content-first authoring correction followed this result.

## Final renderer correction

Release 0.5.6 keeps the evaluated authoring and review code. It reserves the actual padded width for titles, reduces long-heading type size and uses smaller type for long word-card labels. The real metal/wood output was re-rendered as regression stills: the long title and `Temperature` label now fit. Concise repairs can use up to three seconds per scene to read the finished board while retaining the existing 0.8-1.25 tempo bounds. Excessively short or long narration still fails; no script or scientific claim is invented to fill time.

The bicycle timing regression is a separate replay of the exact failed input, not a change to the five-topic denominator. Its outcome and final deployment verification are recorded below.

## External gates before claiming full hackathon readiness

The read-only AgentMail check returned **HTTP 403 `missing_permission`**. The local configuration has a key but no `AGENTMAIL_INBOX_ID` or `AGENTMAIL_WEBHOOK_SECRET`. A permitted key, matching inbox/webhook configuration and an owner-consented verification/delivery test remain necessary. No email or webhook registration was performed.

The official event names OpenAI in its sponsor-stack criterion. This release respects the owner's NVIDIA/Cloudflare-only inference requirement, so eligibility and sponsor scoring remain unconfirmed. The owner must obtain clarification, record the demo, gather real user feedback and submit/post the actual entry. The core app is available for recording now; this is not a claim that those external requirements are complete.

## Renderer regression outcome

The exact failed bicycle revision 2 rendered locally on 0.5.6 without changing narration: 1440 frames / 60-second timeline, 60.1-second probed MP4 container, 118.23 seconds processing with four cached narration scenes. All scene boundaries and predicted word timings fit. SHA-256: `542129213b5d4f5e9071c90e00eb18500a9cea03747b1f6864757930ab7bee1e`. See `renderer-056-regression.json`. This focused replay was not uploaded as an approved lesson and does not turn the frozen evaluation into 5/5.

Commit `58e1d09` passed Vercel's clean-install checks (79 tests plus full builds) at https://explainer-studio-checks-n85loye45-avinash1286s-projects.vercel.app . Local 0.5.6 checks passed 80 tests and all builds; final Git/Vercel deployment status is verified at handoff.

## Verified deployment handoff

Runtime release commit `020712c` is pushed to the public main branch. Its Vercel deployment https://explainer-studio-checks-f0fim0q5k-avinash1286s-projects.vercel.app is Ready after a clean install, 80 tests, TypeScript, lint, static export and worker builds. GitHub Actions is disabled at repository level.

Zerops mediaworker is ACTIVE with an authenticated, fresh 0.5.6 heartbeat and all seven capabilities. Public `/`, `/api/health` and the solar example returned HTTP 200; health reports generation enabled. The frontend and backend retain the already verified generation/edit/share behavior; 0.5.6 changes the renderer, not the evaluated authoring/review code. Evaluation monitors and the temporary local media worker were stopped after completion. No private workspace state is included in the recording package.
