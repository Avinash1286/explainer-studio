# Visual direction for 0.7.0

Recorded September 6, 2026. This is the implementation and acceptance direction for the owner's request to substantially match the reference videos in `F:\cai\target` and use a clean canvas without fixed headers or footers. It is not a declaration that a newly generated lesson has passed that acceptance. The previous release's technical checks and readable word cards did not establish the requested visual quality.

## Fresh reference review

Ten source videos were examined again, using contact sheets distributed across their runtimes and denser samples of selected sequences. The findings below come from those images, not only the earlier notes in `plan.md`. This was sampled visual inspection, not continuous playback or a fresh audio assessment. The reference media remains local and is not copied into the product.

| Reference file | Duration | Fresh sampling | Explanatory forms observed |
| --- | ---: | --- | --- |
| `hbHgChwV2jtgApTP.mp4` | 219.947 s | Every 8 s; 0.5 s intervals from 56–71.5 s | Specialist characters, hospital routing, differently sized capacity tanks, compressor funnel, balance scale, bounded curves |
| `JBZaEhxrT_RyAkl8.mp4` | 256.000 s | Every 8 s; 1 s intervals from 44–63 s | Model-to-product fanout, terminal and globe, agent loop with returned results, download/study/deploy, scale comparisons |
| `mcrJnlGMgvssk0ts.mp4` | 222.763 s | Every 8 s; 1 s intervals from 56–79 s | Objective/repository/tools, token-to-harness loop, training inputs, teacher groups, pause/resume, screenshot feedback |
| `mfMCyR_1OG3g1C05.mp4` | 67.712 s | Every 3 s; 0.5 s intervals from 16.5–24 s | Mendel character and garden, anatomically recognizable tall/short pea plants, crossing parents, counted offspring, allele separation |
| `MqqGMmVYUds8vOfD.mp4` | 81.379 s | Every 3 s; 1 s intervals from 39–56 s | Deleted notes and past actions, retention versus compaction, notebook/lightbulb/map, summary stack, result bars |
| `o-fXMoIf0PxMF1Wo.mp4` | 80.875 s | 16 frames across runtime; 2 fps from 18–26 s | Document-to-application fanout and progressive tool/context assembly |
| `tncR6TDveuXX7cv9.mp4` | 219.051 s | 16 frames across runtime | Benchmark comparisons, bars and visual caveats |
| `u-SJl9tE4v35j4aq.mp4` | 190.933 s | 16 frames across runtime; 2 fps from 22–30 s | Attention layers, bypass paths, weighting and proportional graphics |
| `vgJd4eKKsqRkhknN.mp4` | 239.189 s | 16 frames across runtime | Characters, explicit object counts and timelines |
| `YlZjU2Tmg3QHHaH-.mp4` | 266.965 s | 16 frames across runtime; 2 fps from 156–164 s | Token matrices, notebook memory and update gates |

The first five were independently inspected by the illustration reviewer; the final five and the generated comparison were inspected by the coordinating reviewer. Source contact sheets and probe data are in ignored `runs/reference-refresh/audit/` and `runs/reference-refresh/root/`. They are review artifacts, not release output. All five independently probed sources use 12 fps; this is an observed source property, not a requirement to lower the renderer's frame rate.

The generated comparison is a 60.053-second lesson sampled at 16 points, saved as `runs/reference-refresh/root/generated.jpg`. Its repeated word cards, large unused cream regions and fixed frame overlays made the difference apparent. Removing those overlays alone would not fix the underlying composition.

## What the references actually do

- **Draw the subject.** Plants have stems, leaves and meaningful height differences. A hospital, receptionist and specialist doctors make routing concrete. A tank shows capacity; a funnel shows compression; a valve shows control. The object's shape and parts carry meaning before its label is read.
- **Compose around the relationship.** Boards use fanouts, loops, converging parents, counted rows, timelines, spatial groups and comparisons. They do not force every explanation into the same two or three equal cards. Object positions reserve room for later additions.
- **Build in place.** At 16.5–24 seconds in the Mendel example, a blank board becomes a heading, a tall plant outline and fill, a short plant outline and fill, converging arrows and a heart, then offspring and supporting symbols. Existing subjects remain anchored.
- **Let the relation arrive separately.** At 44–62 seconds in the Kimi overview, terminal and internet objects appear, arrows connect them to an agent gear, and a curved return path completes the system. At 56–74 seconds in the autonomous-work example, the token/tool/harness/environment chain becomes a loop only when output is returned.
- **Allow titleless mechanism boards.** The memory example at 39–56 seconds builds a two-row retention/compaction diagram from a notebook, bulb, map, stack and summary, with a bracket grouping the outcome. It needs no permanent title strip.
- **Keep the surface plain.** Near-white canvas, dark rounded outlines, small flat palettes, short labels beside the relevant objects and ample breathing room dominate. Headings, when used, are bold informal lettering inside the composition. There are no product-style enclosing card shells, shadows or gradients.
- **Use construction as the default motion.** Outlines or object parts appear before flat fills; arrows and grouping marks follow. The sampled sequences predominantly use a fixed camera, holds and clean board resets. Many boards accumulate over roughly 10–20 seconds, although timing varies. Continuous bobbing, spinning or drifting is not the observed default.

The references contain small Lamina branding and a tiny footer. The owner's explicit instruction takes precedence: omit fixed branding, collection headings, scene counters, takeaway banners, credits and burned caption strips from the video canvas. Optional subject labels or a purposeful in-board heading are content, not a reserved header band. Captions and attribution can remain in the surrounding player and downloadable files.

Copy the explanatory method, not reference logos, artwork, model marketing claims or numerical errors. For example, counted dots and chart heights must agree with the underlying values even where a reference is only approximate.

## Architecture being implemented

The previous scene contract's concept notes remain readable for saved projects, but newly authored lessons receive a separate visual-director stage. The director preserves the researched narration and emits validated data describing the composition, illustrated entities, relationships and meaningful timed actions. It does not emit executable drawing code or external asset URLs.

- `packages/contracts/visual.ts` defines the bounded visual vocabulary, geometry, relationships, action cues, parent relationships and validation. The plan has an explicit explanatory objective and grammar. Labels and boxes cannot dominate the entity list.
- `convex/lib/director.ts` directs each scene through the chosen lesson provider. Exact spoken phrases anchor the introductions and actions. Planning persists the visual plans and their attempts; a scene cannot silently fall back to the old three-card board after directing fails.
- `video/visual-board.tsx` draws the full canvas with native SVG and local lettering. It evaluates every frame from the saved plan, so seeking and repeated rendering do not depend on prior playback. The renderer separates outline reveal, flat fill, relations, motion and state changes. Focus is an in-place emphasis, not a camera movement that can lose the subject offscreen.
- `video/illustrations.tsx` supplies 35 original everyday illustrations in a consistent local `0..100` coordinate system. It includes meaningful plant growth, charge, brightness, fill, heat and opening states, plus exact bounded token counts. It contains no logos, labels, canvas chrome, remote images or ambient motion. The renderer owns scientific primitives and charts.
- The media worker compiles visual cues against actual Kokoro word timings and renders the same saved plan with Remotion. Voice and captions retain their existing pipeline. Repairs must preserve untouched scenes while redirecting the changed scene's visuals where needed.
- `video/composition.tsx` selects the rich board when a visual plan exists and retains a clean legacy renderer for saved scenes. Existing MP4 files are not retroactively changed by a renderer source update.

This is a bounded illustration system. A generic atom or molecule symbol is not proof of a scientifically exact structure. Specific chemistry must use supported atom identities, charges and bonds, or be explicitly schematic. Particle type must be explicit rather than inferred from a decorative color. Object counts, direction, relative size and transformation meaning remain subject to independent factual and visual review.

## Acceptance criteria

The following checks apply to a real generated lesson as well as the renderer calibration. Passing a schema or producing an MP4 is insufficient.

| Area | Required observable result |
| --- | --- |
| Clean canvas | No fixed title, collection header, footer, counter, credits, takeaway banner or burned caption strip at any sampled frame. No card-shell layout around every subject. |
| Subject identity | Concrete subjects use recognizable illustrations or an honest scientific primitive. A word card does not substitute for a drawable subject. Labels support the picture. |
| Mechanism | Each scene visibly explains a supported action or relationship. Material, charge, energy or information has the correct identity and direction; no unsupported conversion is introduced. |
| Composition | Layout follows the explanation and varies where the story requires it. Related objects have purposeful scale and spacing, with stable identities across scenes. |
| Timing | Construction and actions follow the spoken phrases throughout the scene, with enough time to read the result. The board does not finish instantly and remain unchanged for most of the narration. |
| Motion truth | Movement, rotation, flow and state changes have a stated explanatory purpose. No decorative default wiggle. Charge signs, bonds, counts, proportions and chart values remain accurate. |
| Geometry | Labels, outlines, arrows, particles and focus marks fit at the start, middle and end of each action. Also inspect rotated, moved, parented and enlarged objects—not only final boards. |
| State and seeking | Off/empty/closed states are visibly distinct; hide followed by draw can reveal again. An arbitrary frame renders identically regardless of the previous requested frame. |
| Review coverage | Inspect sampled full-lesson frames, dense action sequences and normal-speed playback with audio. Automated frame review must cover evolving mechanisms, not only end boards. |
| Generalization | Record fresh provider-authored topics beyond the hand-authored solar calibration. Preserve failures and repairs in the evidence; do not relabel a fixture or fallback as a generated result. |
| User acceptance | Let the owner compare the actual new video with the target references. Rendering success and internal visual inspection do not replace that comparison. |

## Evidence and remaining work

The everyday illustration implementation has passed focused TypeScript, ESLint and bundling checks. All 35 glyphs and the sampled `0`, `0.5`, `1` state families were rendered with Remotion and manually inspected in `runs/reference-refresh/audit/GlyphAtlas.png` and `StateAtlas.png`. This verifies the library's appearance and basic state behavior, not the full lesson workflow.

`packages/contracts/visual-fixture.ts` is explicitly hand-authored **renderer calibration**. Its plan, narration, renders and contact sheets must keep that provenance. It is never a topic fallback, live generation success or user trial. Likewise, an illustration atlas verifies assets rather than an AI director's choice of assets.

The live NIM development run produced two full 60-second MP4s after the original workflow and four operator resumes. Revision 1 was rejected; its automatic repair produced revision 2, whose review ended unavailable. Manual inspection still found an obscured interior mechanism, small repeated panels and an incomplete circuit. These failures led to actual fitted focal-size validation, a movement-before-hide fix, source context reduction, isolated scene review and a guard against unchanged visual repairs. Full observations, hashes, playback limits and current rollout state are maintained in [visual acceptance evidence](visual-acceptance-070.md).

Neither the calibration nor these development renders establish reference-level acceptance. The owner still needs a newly generated result worth comparing with the targets. Existing hackathon submission, consented delivery and user-trial requirements remain separate.
