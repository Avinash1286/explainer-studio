# H3 repair reliability ? September 5, 2026

Engineering changes are implemented; live content acceptance remains incomplete. No generated video was newly approved or emailed in this phase.

## Implemented

- NVIDIA-to-Cloudflare fallback after bounded invalid output, in addition to transient HTTP/network fallback. At most three text calls per provider; authentication failures still stop immediately. Malformed JSON and truncated output produce useful repair feedback.
- Scene replacement uses original source-passage IDs, canonical icon labels and faithful cue vocabulary. Selected scenes change while other scenes and project metadata remain intact. Known misleading icon/cue substitutions are rejected.
- Narration fitting selects model-authored optional sentences within the remaining word budget. It does not generate filler or cut sentences. A final regression check requires complete punctuated takeaway sentences after a live candidate cut off its last word. Punctuation alone cannot prove completeness or truth.
- One audited internal recovery for a failed automatic repair, without resetting the automatic repair budget. Successful repair attempt provenance is saved.
- A local repair/render/frame-review CLI with input-hashed checkpoints, validation on resume and nonzero failure exits. The final CLI also saves an unavailable-review record on provider failure; this recording branch was added after the observed 429 and was not separately live-replayed.

## Verification

TypeScript, lint, 62 tests, Next export and worker/verification bundles pass. Tests cover raw malformed output, truncation, bounded fallback, credential errors, repair scope, evidence references, narration options, icon constraints, incomplete takeaways and one-time operator recovery.

The live local repair used NVIDIA for three rejected candidates, then Cloudflare for one rejected candidate and one structurally valid candidate. That last candidate was rendered with real Kokoro and Remotion: 60 seconds, 1,440 frames, 1280?720, 150.84 seconds total on Windows, one unchanged-scene TTS cache hit. This is not a Zerops benchmark or a successful deployed automatic repair. SHA-256: `6a6af206109ca476b74177d0abf39b184d35e542b79158795f0dec1d5c85cd25`.

Cloudflare frame review returned HTTP 429. Manual inspection of decoded end boards rejected the candidate: the final takeaway ends in ?transfer of poll?, scene 4 arrows do not clearly express the mechanism, and scene 3 repeats pollination under a Seed Formation title. The incomplete takeaway is now rejected before rendering. The candidate remains unapproved; there is no claim that the final compiler generated a passing replacement. Audio was synthesized but not manually listened to in this acceptance run.

The original deployed bees draft remains failed at revision 2 after its single administrative recovery failed under an earlier implementation. No stored review, version or recovery budget was reset. A fresh 75-second water-cycle browser test retained its research checkpoint but failed planning; its final workflow records a Cloudflare transport/deadline error (status 0). Two operator resumes followed implementation changes; no further automatic retry was started.

## Deployment and next work

Backend changes are deployed to development and production. Production generation remains disabled; the existing scripted demo remains available. Frontend and Zerops worker code did not change. GitHub Actions stays disabled; Vercel Git integration validates pushes. See the GitHub commit and Vercel check for deployment evidence.

Next: improve initial planning and causal diagram selection, then demonstrate a fresh passing topic and a targeted scene edit. Complete the separately configured, explicitly consented AgentMail test before claiming H3 acceptance. H4's five-unseen-topic evaluation follows those gates.

Machine-readable evidence: [repair-acceptance.json](repair-acceptance.json).
