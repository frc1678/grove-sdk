import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "server",
          environment: "edge-runtime",
          include: ["src/**/*.test.ts"],
          exclude: ["src/build/**/*.test.ts"],
          server: { deps: { inline: ["convex-test"] } },
        },
      },
      {
        // The build helpers run in Node, from an app's vite.config.ts: they
        // shell out to git and read files, which the edge runtime cannot.
        test: {
          name: "build",
          environment: "node",
          include: ["src/build/**/*.test.ts"],
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
