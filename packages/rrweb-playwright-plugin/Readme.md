# @appsurify-testmap/rrweb-playwright-plugin

## Configuration

```ts
// playwright.config.ts — no `declare module` needed, the plugin augments
// PlaywrightTestOptions with `testmap`.
export default defineConfig({
  reporter: [['@appsurify-testmap/rrweb-playwright-plugin/reporter']],
  use: {
    testmap: {
      outputReportDir: 'test-results/playwright/ui',
      recordingOpts: { /* JSON-serializable rrweb record options */ },
      settleBeforeStop: { networkIdle: true, domQuietMs: 300, timeout: 5000 },
    },
  },
});
```

### `settleBeforeStop` (default: enabled)

A test usually ends on an assertion that the first paint already satisfies
(URL, a heading) while API data is still loading. Before stopping the recorder
the plugin therefore:

1. waits until no request has been in flight for 500 ms (`networkIdle`) —
   tracked per page, so SPA requests after a client-side route change count
   too (Playwright's own `networkidle` fires once per document and would miss
   them); EventSource/WebSocket are ignored;
2. waits until the DOM has had no mutations for `domQuietMs`;
3. takes a final FullSnapshot if the DOM changed since the last one.

All of it is capped by `timeout`; when the cap is hit, a step fails, or the page
navigates/closes, the recorder simply stops (logged via `console.debug`, the
test is not affected). The wait is skipped for tests that did not pass.

Cost: a page that is already idle stops after ~`domQuietMs`. The wait runs in
the page fixture's teardown, i.e. in Playwright's after-hooks budget (a separate
budget equal to the test timeout), not in the test body's timeout. Since
Playwright 1.60 it is part of the reported test duration.

`settleBeforeStop: false` restores the stop-immediately behaviour.

### When the recorder stops

In the `page` fixture teardown — after the test's `afterEach` hooks, so actions
performed there are recorded too. The plugin does not hook Playwright's private
"test function finished" callbacks: they run before `afterEach`, and their shape
differs between versions (`_onDidFinishTestFunction` method,
`_onDidFinishTestFunctionCallback` — which Playwright's artifacts recorder also
assigns — and, since 1.60, the `_onDidFinishTestFunctionCallbacks` set), which
made the stop point depend on the installed Playwright version.

## Notes
