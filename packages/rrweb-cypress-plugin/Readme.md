# @appsurify-testmap/rrweb-cypress-plugin

## Notes


```
// file: cypress.config.ts
export default defineConfig({
  fixturesFolder: false,
  env: {
    testmap: {
      recordingOpts: {
        checkoutEveryNvm: 5,
        // excludeAttribute: /data-(cy|test(id)?|cypress|highlight-el|cypress-el)/i,
        maskInputOptions: { password: true },
        sampling: {
          mousemove: false,
          mouseInteraction: {
            MouseUp: false,
            MouseDown: false,
            Click: true,
            ContextMenu: true,
            DblClick: true,
            Focus: true,
            Blur: true,
            TouchStart: false,
            TouchEnd: false,
          },
          scroll: 100,
          media: 100,
          input: 'last',
          canvas: 'all',
          visibility: {
            mode: 'debounce',
            debounce: 100,
            threshold: 0.5,
            sensitivity: 0.05,
            rafThrottle: 100
          }
        },
        flushCustomEvent: 'after',
        // recordAfter: 'DOMContentStabilized',
        recordAfter: 'DOMContentLoaded',
      }
    }
  },
  e2e: {
    setupNodeEvents(on, config) {
      registerRRWebReportTasks(on, {...config, outputReportDir: 'test-results/cypress/ui'});
      return config;
    },
    baseUrl: 'http://localhost:8888',

  },
})

```

```
// file: support.js
const { initializeTestmap } = require('@appsurify-testmap/rrweb-cypress-plugin')

initializeTestmap()

```
