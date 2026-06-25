import { defineConfig } from "vitest/config";

// Appsurify TestMap wiring for Vitest:
//  - setupFiles registers per-test recording hooks (needs globals: true)
//  - globalSetup's teardown() bundles the report ZIP after the run
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["@appsurify-testmap/rrweb-selenium-plugin/vitest"],
    globalSetup: ["@appsurify-testmap/rrweb-selenium-plugin/vitest-teardown"],
    include: ["test/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
