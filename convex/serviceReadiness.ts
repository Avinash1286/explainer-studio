import { internalQuery } from "./_generated/server";
import { generationReady } from "./lib/generationConfig";
export const read = internalQuery({ args: {}, handler: async ctx => ({ enabled: (await generationReady(ctx)) || (await generationReady(ctx, false, "openai")) }) });
