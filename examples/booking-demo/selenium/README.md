# Selenium consumer demos — `@appsurify-testmap/rrweb-selenium-plugin`

Four standalone consumer projects showing how to integrate the Selenium plugin
with each supported test runner. They are a port of the upstream `e2e-demo`,
rebranded to Appsurify TestMap.

| Folder | Runner | Wiring |
| --- | --- | --- |
| [`mocha-selenium`](./mocha-selenium) | Mocha | `.mocharc.cjs` → `require: ['…/mocha']` |
| [`jest-selenium`](./jest-selenium) | Jest | `globalSetup: '…/jest-setup'` + `setupFilesAfterEnv: ['…/jest']` + `globalTeardown: '…/jest-teardown'` |
| [`vitest-selenium`](./vitest-selenium) | Vitest | `setupFiles: ['…/vitest']` + `globalSetup: ['…/vitest-teardown']` (needs `globals: true`) |
| [`node-test-selenium`](./node-test-selenium) | node:test | `import '…/node-test'` at the top of each test file |

In **every** runner the only line your tests need is:

```js
const driver = attach(await new Builder().forBrowser('chrome').build());
```

Each project is self-contained (its own `package.json` with a `file:` dependency
on the local plugin build) so you can copy a folder out as a working starting
point.

## Running

These projects are **not** part of the repo's yarn workspaces — each has its own
`node_modules`. After (re)building the plugin you must rebuild it and reinstall so
the `file:` copy is current:

```bash
# from the repo root: build the plugin once
yarn workspace @appsurify-testmap/rrweb-selenium-plugin run build

# then, in any demo folder:
cd examples/booking-demo/selenium/mocha-selenium
npm install
npm test
```

All four use **Chrome headless** (a `chromedriver` on PATH, or Selenium Manager).
Switch to Firefox by changing the two `chrome` lines in the test file.

## Output

```
test-results/selenium/ui/
├── <spec>/<browser>/<suite>-<test>.json   # { events, metadata }
└── ui-coverage-reports.zip                 # all per-test JSON, deflate-compressed
```

Every report is `{ events, metadata: { runner, spec, suite, test, browser } }`
with `runner.source === "selenium"` and each event stamped with a sequential `id`
— identical in shape to the Playwright and Cypress plugin reports.

The output dir is **wiped once at the start of each run** (overwrite, not append),
matching the Playwright/Cypress plugins. Mocha and Vitest do this automatically;
Jest needs the `globalSetup` line above; `node-test-selenium` keeps a `pretest`
clean because Node's runner has no single pre-run hook (subprocess-per-file).

## Validating the reports

After running the demos, validate every stack's output against the **real**
appsurify-testmap backend `ui_report` converter:

```bash
cd examples/booking-demo
scripts/.venv/bin/python scripts/validate_selenium_report.py
```

For each stack it checks the report (1) structurally (envelope, required metadata
fields the backend dataclasses demand, sequential ids, META + FULL_SNAPSHOT,
the ZIP bundle) and (2) by running `Report.from_raw(...)` and asserting it yields
pages / snapshots / elements / actions / interaction coverage. Point at a
different backend checkout with `--backend <path>` (or `TESTMAP_BACKEND_SRC`), a
single stack with `--runner mocha`, or skip the converter with `--no-convert`.
Exit code is non-zero on any failure, so it is CI-usable.
