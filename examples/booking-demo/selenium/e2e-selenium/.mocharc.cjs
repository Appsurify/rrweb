module.exports = {
  require: ["@appsurify-testmap/rrweb-selenium-plugin/mocha"],
  // No `spec` here so a CLI file arg (the test:<suite> scripts) selects a single
  // file; with no arg, mocha defaults to loading test/*.cjs (all suites).
  timeout: 90000,
  // Live third-party sites are occasionally flaky; one retry keeps the suite
  // useful as a recording smoke test without masking real regressions.
  retries: 1,
};
