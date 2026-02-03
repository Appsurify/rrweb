// cypress.config.ts
import { defineConfig } from 'cypress'

import registerRRWebReportTasks from '@appsurify-testmap/rrweb-cypress-plugin/reporter';

export default defineConfig({
  reporter: 'junit',
  reporterOptions: {
    mochaFile: 'test-results/cypress/junit/test-output-[hash].xml',
    toConsole: false,
  },

  screenshotOnRunFailure: false,
  screenshotsFolder: 'test-results/cypress/screenshots',
  videosFolder: 'test-results/cypress/videos',
  video: false,
  numTestsKeptInMemory: 100,
  defaultCommandTimeout: 15000,
  chromeWebSecurity: false,
  env: {
    device: 'desktop',
    testmap: {
      recordingOpts: {
        // Impact-score configuration for visibility-driven checkout
        // Target: 3-4 FS for the entire booking flow (Solution C+: more aggressive tuning)
        // First attempt (70/25/800/0.95): 6 FS. Increasing threshold further.
        checkoutEveryNvm: 80, // Increased threshold to require more accumulation (was 70)
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
            Focus: false,
            Blur: false,
            TouchStart: false,
            TouchEnd: false,
          },
          scroll: 100,
          media: 100,
          input: 'last',
          canvas: 'all',
          // Enable visibility tracking with throttle to control frequency
          visibility: {
            mode: 'none', // 'throttle',
            debounce: 50,
            throttle: 100, // Check every 100ms max
            threshold: 0.5,
            sensitivity: 0.05,
            rafThrottle: 100
          }
        },
        flushCustomEvent: 'after',
        recordAfter: 'DOMContentLoaded',
        userTriggeredOnInput: true,
      }
    }
  },
  retries: { runMode: 1, openMode: 0 },
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  viewportHeight: 768,
  viewportWidth: 1266,
  defaultBrowser: 'chrome',

  e2e: {
    // baseUrl: 'http://localhost:5180',
    specPattern: 'tests/cypress/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    setupNodeEvents(on, config) {
      registerRRWebReportTasks(on, {...config, outputReportDir: 'test-results/cypress/ui'});
      return config;
    },
  },
  component: {
    devServer: { framework: 'react', bundler: 'vite' },
  },
})
