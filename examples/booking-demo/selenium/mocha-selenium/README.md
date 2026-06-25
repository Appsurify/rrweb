# Mocha + Selenium + Appsurify TestMap

Consumer demo for `@appsurify-testmap/rrweb-selenium-plugin` with Mocha.

Wiring is one config line (`.mocharc.cjs` `require`) plus one line in your tests
(`attach(driver)`). Everything else is ordinary Selenium.

```bash
yarn install      # or npm install
yarn test
```

Reports land in `test-results/selenium/ui/` (per-test JSON + `ui-coverage-reports.zip`).

> Uses Chrome headless (a `chromedriver` on PATH or Selenium Manager). Swap to
> Firefox by changing the two `chrome` lines in `test/app.test.cjs`.
