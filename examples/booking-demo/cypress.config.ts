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
        checkoutEveryNvm: 10,
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
            mode: 'none',
            debounce: 50,
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
