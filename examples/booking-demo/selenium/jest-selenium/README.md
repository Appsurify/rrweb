# Jest + Selenium + Appsurify TestMap

Consumer demo for `@appsurify-testmap/rrweb-selenium-plugin` with Jest.

Wiring is two config lines (`setupFilesAfterEnv` + `globalTeardown`) plus one line
in your tests (`attach(driver)`).

```bash
yarn install      # or npm install
yarn test
```

Reports land in `test-results/selenium/ui/` (per-test JSON + `ui-coverage-reports.zip`).

> jest-circus does not expose pass/fail or a suite/test split to after-each hooks,
> so `test.state` is omitted and the full test name is used as the title.
