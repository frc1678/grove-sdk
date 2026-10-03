import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "server",
          environment: "edge-runtime",
          include: ["src/**/*.test.ts"],
          exclude: ["src/build/version.test.ts"],
          server: { deps: { inline: ["convex-test"] } },
        },
      },
      {
        // The build helper runs in Node, from an app's vite.config.ts, and
        // shells out to git — neither of which the edge runtime has.
        test: {
          name: "build",
          environment: "node",
          include: ["src/build/version.test.ts"],
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
