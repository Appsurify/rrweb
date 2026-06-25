# node:test + Selenium + Appsurify TestMap

Consumer demo for `@appsurify-testmap/rrweb-selenium-plugin` with the built-in
Node.js test runner. No config file — a single import wires the per-test hooks and
the ZIP teardown.

```bash
yarn install      # or npm install
yarn test         # node --test test/*.test.mjs
```

You can also preload without editing test files:

```bash
node --import @appsurify-testmap/rrweb-selenium-plugin/node-test --test test/*.test.mjs
```

Reports land in `test-results/selenium/ui/` (per-test JSON + `ui-coverage-reports.zip`).
