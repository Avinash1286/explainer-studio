import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const heartbeat = internalMutation({
  args: { workerId: v.string(), instanceId: v.string(), capabilities: v.array(v.string()), version: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("workers").withIndex("by_workerId", (q) => q.eq("workerId", args.workerId)).unique();
    const value = { ...args, lastHeartbeat: Date.now() };
    if (row) await ctx.db.patch(row._id, value);
    else await ctx.db.insert("workers", value);
    return null;
  },
});
