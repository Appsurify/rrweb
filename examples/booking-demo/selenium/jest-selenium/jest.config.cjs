// Appsurify TestMap wiring for Jest:
//  - globalSetup wipes the output dir once before the run (overwrite, not append)
//  - setupFilesAfterEnv registers per-test recording hooks (one line)
//  - globalTeardown bundles the report ZIP after the run (one line)
module.exports = {
  testEnvironment: "node",
  globalSetup: "@appsurify-testmap/rrweb-selenium-plugin/jest-setup",
  setupFilesAfterEnv: ["@appsurify-testmap/rrweb-selenium-plugin/jest"],
  globalTeardown: "@appsurify-testmap/rrweb-selenium-plugin/jest-teardown",
  testMatch: ["**/test/**/*.test.cjs"],
  testTimeout: 60000,
};
