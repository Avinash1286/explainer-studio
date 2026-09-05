# Visual revision: implementation and observed evidence

Updated September 6, 2026. This record separates the implemented 0.7 illustration system from acceptance of a provider-generated video. **Reference-level visual acceptance is still open.** OpenAI remains disabled at the owner's request.

The [fresh reference review](visual-direction-070.md) covers all ten current files in `F:\cai\target`, with distributed frames and denser motion sequences. This was sampled visual inspection, not continuous playback or fresh listening to all reference audio. Original reference artwork is not distributed with the app.

## Implemented changes

- Full white video canvas without fixed titles, headers, footers, counters, takeaway banners, credits or burned caption strips. Captions and attribution remain separate. Existing stored MP4s do not change retroactively.
- Independent visual direction after researched narration, using 51 bounded kinds, original local illustrations, relationship graphs and narration-anchored actions. New directed lessons cannot silently fall back to word cards.
- Deterministic progressive outlines and flat fills, visible state changes, explicit particles, material containment, actual glyph bounds and movement that arrives before its subsequent hide begins.
- New 0.7.1 direction requires an actual fitted focal illustration at least 358.4 pixels wide and 288 pixels high. For the square glyph viewport this means at least 358.4 pixels square; nominal dimensions alone cannot satisfy it. A distributed board can instead use at least three linked primary illustrations of 180 pixels or more, spanning at least 55% of canvas width and 50% of height with two meaningful connections. Unlinked decoration cannot pad those bounds. These checks constrain new direction, not playback of old saved projects.
- Direction and review now emphasize visible starting states, interactions and changed results; unobscured cutaways; necessary return paths; and supported causal intermediates. Changing reviewer notes alone cannot satisfy a structured failed visual review.
- Visual review isolates each scene's actual JPEG bytes and literal scene ID. Per-scene model/response/usage provenance is retained. Independent factual review still receives the full research.
- Factual review and each scene review run as separate durable workflow steps. Retries reuse successful checks, while exact revision, source, provider and stored-media checks prevent stale or partial results from approving a lesson.
- Container surfaces paint before contained paths and subjects, including when a model declares a child first. Exterior-only boards retain their previous paint order. Routing and overlaps still require visual review.
- Director context uses original passages around validated scene citations rather than the full source packet. For the saved four-scene solar input, serialized request content fell from 176,621 to 79,677 characters (54.89%). This is a measured input-size reduction, not a demonstrated latency or token-cost reduction.

## Actual NIM development run

Question: “How does a solar cell turn sunlight into electricity?” 60 seconds, beginner, NIM route. Development job `j978ksc6xmhm97epgw8sm1qzzn8dvz6v`.

Planning required the original workflow and four operator resumes while implementation changed. Failures included invalid cues/JSON/movement parameters, an NVIDIA timeout, Cloudflare HTTP 429, and a saved-plan validation mismatch caused by deploying a new rule while an older action was still running. Saved checkpoints and failures remain intact. This is development recovery evidence, **not a successful first-pass benchmark**.

| Output | Actual observation |
| --- | --- |
| Revision 1 | Rendered 1,440 frames / 60 seconds, 1280×720. Automated review rejected unsupported counts/charge labels and visual findings. Manual inspection found a tiny repeated exterior panel, an obscured interior mechanism, a label collision and an incomplete external circuit. |
| Revision 2 | Automatic repair rendered another complete MP4. It removed the explicit photon count and front-contact charge sign, but left scene 2 unchanged and returned an identical scene 4 visual plan despite its requested repair. Review ended unavailable after provider errors. It is not approved. |

Local output directories: `runs/jn79e93d7yryaqb9a3xy2xabzx8dvfk5-1` and `runs/jn79e93d7yryaqb9a3xy2xabzx8dvfk5-2`. Contact sheets and private job inspection state are under ignored `runs/visual070/`. Never publish the session token in `live-state.json`.

- R1 SHA-256: `b9ba0ef1d6571f6d1bc5ae55b61b7f2ecd65f9b15efbc472132e9dbe66b42dd1`; R2: `da5475fac7b6b5d202c2b4cb51891a6c68cf9b282be082ec10ad419323f13d07`.
- R1 browser playback reached its 60.1-second container end with no media error and zero dropped frames. Playback was muted; this does not establish spoken-audio quality. FFmpeg measured −16.10 LUFS and −1.31 dBTP.
- R1/R2 total local worker times were 83.56/90.25 seconds. All four TTS segments were already cached. Do not present these as cold-worker or complete generation latency.
- R2 timing and all 12 saved review samples exactly match the updated compiler. A new scene-isolated review can inspect the same stored MP4 without falsifying its frame positions.
- The first batch image critic mixed up scene IDs and misidentified the panel. Its verdict alone was insufficient; the new isolated-scene workflow addresses the observed association failure, not a guarantee of perfect visual judgment.

## Calibration and limited regression evidence

`runs/visual070/calibration-final/video.mp4` is a 51.29-second **hand-authored renderer calibration**, never a provider-generated success. It demonstrates the clean canvas, photon absorption, motion within a lattice and a return circuit. `generated-scene-1-timing-fixed/video.mp4` is a 14.92-second excerpt using an earlier provider-authored scene unchanged; the compiler shortened its movement to arrive when the hide cue begins. It verifies a timing correction, not full-lesson acceptance.

## Rollout and remaining acceptance

Feature commit `ab1acb4` was pushed and its Vercel validation deployment reached Ready with 163 tests. The 0.7.0 production worker is active with protocol 6. The production backend still uses the earlier generation path; The 0.7.1 follow-up passed npm run check with 200 tests across 20 files, TypeScript, ESLint and web/worker builds. Its rollout and fresh generated acceptance are pending at this record. The old public solar example has not been replaced.

Before calling this reference-level or hackathon-ready, record a fresh provider-generated result, independent factual and scene-specific pixel review, dense mechanism inspection, normal-speed audio/video review and the owner's comparison with the targets. Keep failures and operator intervention in the record. Existing hackathon items—consented email delivery, real user trials, demo and submission—remain separate.
