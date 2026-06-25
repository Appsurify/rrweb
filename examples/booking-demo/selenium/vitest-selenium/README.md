# Vitest + Selenium + Appsurify TestMap

Consumer demo for `@appsurify-testmap/rrweb-selenium-plugin` with Vitest.

Wiring is `setupFiles` + `globalSetup` (requires `globals: true`) plus one line in
your tests (`attach(driver)`).

```bash
yarn install      # or npm install
yarn test
```

Reports land in `test-results/selenium/ui/` (per-test JSON + `ui-coverage-reports.zip`).
