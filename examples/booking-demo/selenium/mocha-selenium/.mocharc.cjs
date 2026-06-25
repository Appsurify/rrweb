// Appsurify TestMap wiring for Mocha — the one config line:
//  - `require` loads the plugin's Mocha root hooks (per-test record) + global
//    teardown (bundles the report ZIP after the run).
module.exports = {
  require: ["@appsurify-testmap/rrweb-selenium-plugin/mocha"],
  spec: ["test/**/*.test.cjs"],
  timeout: 60000,
};
