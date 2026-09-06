import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "server",
          environment: "edge-runtime",
          include: ["src/**/*.test.ts"],
          server: { deps: { inline: ["convex-test"] } },
        },
      },
      {
        // React component tests need a DOM; everything else runs on the edge
        // runtime, which is what a Convex function sees.
        test: {
          name: "react",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
        },
      },
    ],
  },
});
