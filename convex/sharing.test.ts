import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reviewSetup, goodReview, owner } from "../tests/review-helpers";
import { api, internal } from "./_generated/api";
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("approved version sharing without email", () => {
  it("keeps ordinary lessons out of the public gallery and publishes only an approved version", async () => {
    const { t, jobId, lease, result } = await reviewSetup();
    const entry = { slug: "test-lesson", jobId, revision: 1, description: "Synthetic test example" };
    expect(await t.query(api.showcase.list, {})).toEqual([]);
    await expect(t.mutation(internal.showcase.publish, entry)).rejects.toThrow("approved");
    await t.mutation(internal.media.complete, { ...lease, result });
    await t.mutation(internal.reviews.commit, { jobId, revision: 1, reportJson: JSON.stringify(goodReview()), provider: "nvidia", model: "test", usageJson: "{}" });
    expect(await t.query(api.showcase.list, {})).toEqual([]);
    await t.mutation(internal.showcase.publish, entry);
    expect(await t.query(api.showcase.get, { slug: entry.slug })).not.toBeNull();
    expect(await t.query(api.showcase.get, { slug: "not-published" })).toBeNull();
  });
  it("enforces ownership and approval, is idempotent, and revokes all capabilities", async () => {
    const { t, jobId, lease, result } = await reviewSetup();
    const shareToken = "b".repeat(64);
    const args = { token: owner, jobId, revision: 1, shareToken };
    await expect(t.mutation(api.delivery.createShare, args)).rejects.toThrow("reviewed");
    await t.mutation(internal.media.complete, { ...lease, result });
    await t.mutation(internal.reviews.commit, { jobId, revision: 1, reportJson: JSON.stringify(goodReview()), provider: "nvidia", model: "test", usageJson: "{}" });
    const url = await t.mutation(api.delivery.createShare, args);
    expect(await t.mutation(api.delivery.createShare, args)).toBe(url);
    expect(await t.query(api.delivery.shared, { token: shareToken })).not.toBeNull();
    const stranger = "c".repeat(64); await t.mutation(api.sessions.start, { token: stranger });
    await expect(t.mutation(api.delivery.revokeShares, { token: stranger, jobId })).rejects.toThrow("not found");
    await t.mutation(api.delivery.revokeShares, { token: owner, jobId });
    expect(await t.query(api.delivery.shared, { token: shareToken })).toBeNull();
  });
});
