# Model-provider change

Hosted model work is now restricted to NVIDIA NIM and Cloudflare Workers AI. Local Kokoro-82M remains the TTS engine. OpenAI calls, model configuration and key requirements have been removed.

- Writing and scene repair: NVIDIA, with Cloudflare fallback on transient errors.
- Rendered-frame review: Cloudflare Llama 4 Scout; actual decoded JPEG bytes, validated structured output, version fencing and deterministic icon checks. Review records and UI show Cloudflare truthfully.
- Icon embeddings: Cloudflare BGE, stored and searched in Convex.
- Email: separate AgentMail configuration through `npm run delivery:setup`; no email was sent.

All 53 tests and the full type/lint/web/worker build passed. A real eight-frame API probe and deployed Convex review produced a persisted rejection of the flawed bees lesson. The independent icon guard caught errors missed by the model. See `docs/model-provider-validation.json` for evidence. Production generation remains disabled while repair/content acceptance is incomplete.

The [official All Gas criteria](https://www.convex.dev/hackathons/all-gas) expect OpenAI, Firecrawl and AgentMail to do real product work. They do not clearly separate per-sponsor disqualification from scoring. Omitting OpenAI therefore creates qualification/scoring uncertainty; using Codex for development is not documented as a replacement for product integration. The implementation follows the owner's provider restriction and does not claim full sponsor compliance.
