import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts", "video/**/*.test.ts"],
    // Each Convex workflow test spins up component schedulers. Bound parallel
    // files so local and small CI machines do not starve those schedulers.
    maxWorkers: 2,
    testTimeout: 15000,
  },
});
