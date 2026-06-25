# @appsurify-testmap/rrweb-selenium-plugin

Drop-in [rrweb](https://github.com/rrweb-io/rrweb) recording for **Selenium v4**
(and other W3C WebDriver / WebdriverIO drivers). Wrap the driver you already build
with a single `attach(driver)` call — every page, navigation, click and input in
the session is recorded and written as an Appsurify TestMap UI‑coverage report.

It is the Selenium sibling of `@appsurify-testmap/rrweb-playwright-plugin` and
`@appsurify-testmap/rrweb-cypress-plugin` and produces the **same report format**.

## How it works

The classic W3C WebDriver protocol has no browser→Node push channel, so this
plugin bridges events with a **polling pump**: the inlined rrweb UMD buffers
events into `window.__testmap_events` in the page, and Node `executeScript`s on a
100 ms interval to atomically swap‑and‑drain that buffer. On `driver.get()` /
`navigate()` the recorder is stopped, the navigation runs, then rrweb is
re‑injected so a multi‑page session is captured as one report. Events carry an
incrementing `id` (via the sequential‑id record plugin), matching the Playwright
and Cypress plugins.

The single recording API (`attach`) is shared across runners; only the per‑test
hook wiring differs. Pick the entry point for your runner below.

## Install

```bash
yarn add -D @appsurify-testmap/rrweb-selenium-plugin selenium-webdriver
```

In every runner, the only line your tests need:

```ts
import { attach } from '@appsurify-testmap/rrweb-selenium-plugin';

const driver = attach(await new Builder().forBrowser('chrome').build());
// ...ordinary Selenium tests, no recording code...
```

## Mocha

`.mocharc.cjs`:

```js
module.exports = {
  require: ['@appsurify-testmap/rrweb-selenium-plugin/mocha'],
  spec: ['test/**/*.test.cjs'],
  timeout: 60000,
};
```

## Jest

`jest.config.cjs`:

```js
module.exports = {
  testEnvironment: 'node',
  globalSetup: '@appsurify-testmap/rrweb-selenium-plugin/jest-setup',
  setupFilesAfterEnv: ['@appsurify-testmap/rrweb-selenium-plugin/jest'],
  globalTeardown: '@appsurify-testmap/rrweb-selenium-plugin/jest-teardown',
  testMatch: ['**/test/**/*.test.cjs'],
  testTimeout: 60000,
};
```

## Vitest

`vitest.config.ts` (`globals: true` is required):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['@appsurify-testmap/rrweb-selenium-plugin/vitest'],
    globalSetup: ['@appsurify-testmap/rrweb-selenium-plugin/vitest-teardown'],
    include: ['test/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
```

## node:test

Import the entry at the top of each test file (or preload with `--import`):

```ts
import '@appsurify-testmap/rrweb-selenium-plugin/node-test';
```

```bash
node --import @appsurify-testmap/rrweb-selenium-plugin/node-test --test test/*.test.mjs
```

## Configuration

`resolveConfig` reads the output directory from an explicit option, then the
`TESTMAP_OUTPUT_DIR` env var, then the default `test-results/selenium/ui`.

To pass rrweb record options or a custom output dir, attach with options:

```ts
attach(driver, { recordOptions: { maskAllInputs: true }, stabilizeMs: 1000 });
```

## Output

Per‑test JSON files, then a single ZIP bundle:

```
test-results/selenium/ui/
├── <spec>/<browser>/<suite>-<test>.json   # { events, metadata }
└── ui-coverage-reports.zip                 # all per-test JSON, deflate-compressed
```

Each report is `{ events, metadata: { runner, spec, suite, test, browser } }`
with `runner.source === "selenium"`.

### Report cleaning (overwrite, not append)

Like the Playwright and Cypress plugins, the output directory is **wiped once at
the start of a run** so reports are overwritten, never appended. This happens in
each runner's single pre‑run hook:

- **Mocha** — automatic (`mochaGlobalSetup`, no extra config).
- **Vitest** — automatic (the `globalSetup` file's `setup()`).
- **Jest** — add `globalSetup: '@appsurify-testmap/rrweb-selenium-plugin/jest-setup'`
  (shown above).
- **node:test** — Node's runner isolates each file in a subprocess and (≤ 22.x)
  exposes no single pre‑run hook, so it can't auto‑clean safely. Wipe the output
  dir yourself before the run, e.g. a `pretest` script:
  `"pretest": "node -e \"require('fs').rmSync('test-results',{recursive:true,force:true})\""`.

## Auto‑attach (optional)

To record every driver a `Builder` creates without touching each `build()` call:

```ts
import { Builder } from 'selenium-webdriver';
import { enableAutoAttach } from '@appsurify-testmap/rrweb-selenium-plugin';

enableAutoAttach(Builder);
```
