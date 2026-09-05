# Release 0.5.5 acceptance evidence

Recorded September 5, 2026. This report separates implementation, automated checks and actual model output. It is not a claim of perfect factual accuracy or confirmed hackathon eligibility.

## Implemented and checked

All three remaining implementation workstreams are present: robust source-grounded authoring and review; the complete revision/download/share workflow; and deployment, evaluation and recording preparation. AgentMail code is implemented, but live delivery remains externally blocked.

- `npm run check` passed on 0.5.5: 79 tests across 11 files, TypeScript, ESLint, Next static export and Node media bundles.
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

Production generation is enabled; `/api/health` returns `generationEnabled:true`. The exact approved solar revision 3 is published at https://wooden-pheasant-677.convex.site/lesson/index.html?example=solar-cells . All four end boards were inspected. The gallery and player work in a fresh browser at desktop and 390-pixel mobile width without horizontal overflow. A fresh public Generate-button lesson is still being checked.

Release commit `a31a963` passed a clean-install Vercel build: 76 tests, TypeScript, lint, static export and worker bundles. Deployment: https://explainer-studio-checks-lodya2gls-avinash1286s-projects.vercel.app (Ready). The final five-topic fixed-code evaluation is recorded in `release-evaluation.json`; it is separate from the earlier mixed-code runs.

Solar revision 3: 60 seconds, 1440 frames, 273.60 seconds media processing, 2184 MiB peak Python TTS RSS, SHA-256 `2ea97106020fd1e760962e5db542b3565017084d187dd4d1933ce59bb217a506`. Cache was cold after the worker deployment; no production cache-hit claim is made for this revision. EIA, DOE and Wikipedia source links returned HTTP 200; two other source servers timed out on this host�s HEAD checks. Their research excerpts remain stored, but current reachability is not claimed.


## Content-first hardening

The initial 0.5.4 fixed-code batch revealed two additional defects: icon-catalog conditioning pulled scripts toward irrelevant objects, and repair prompts omitted the original target scene, causing unnecessary rewrites. The batch is retained as a failed/interrupted evaluation, not a successful release gate. Rain was rejected after its automatic repair; roots reached an unavailable review after repair. Remaining runs were stopped for the correction, with their outcomes retained in the evaluation record.

Release 0.5.5 writes the explanation before choosing natural-language visual concepts, removes per-scene word minimums that encouraged filler, supplies original target scenes to repair, and chooses optional narration closest to the original length. Live text qualification on the existing ice research completed in 22.6 seconds and replaced unrelated sun/leaf/cloud scenes with molecular structure and phase-change explanation. This text-only qualification does not count as a rendered-video pass.

Stopping the superseded batch also exposed a real cancellation bug: the planning workflow can be complete while media remains active. Cancellation now checks workflow status before cancelling it, so a completed planner cannot roll back the media cancellation. A real-workflow regression covers the transition and rejects late worker renewals.

The media runtime remains 0.5.4 because these changes are in backend authoring, repair and cancellation. Final release evaluation follows these corrections.
