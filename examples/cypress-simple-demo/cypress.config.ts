import { defineConfig } from 'cypress';
// @ts-ignore
import registerRRWebReportTasks  from '@appsurify-testmap/rrweb-cypress-plugin/reporter';

export default defineConfig({
  e2e: {
    // Support file
    supportFile: 'cypress/support/e2e.ts',
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
            mode: 'none',
            debounce: 50,
            threshold: 0.5,
            sensitivity: 0.05,
            rafThrottle: 100
          }
        },
        flushCustomEvent: 'after',
        // recordAfter: 'DOMContentStabilized',
        recordAfter: 'DOMContentLoaded',
        userTriggeredOnInput: true,
      }
    }
  },
    setupNodeEvents(on, config) {
      registerRRWebReportTasks(on, {...config, outputReportDir: 'test-results/ui'});
      return config;
    },

    // Application URL
    baseUrl: 'http://localhost:3001',

    // Viewport
    viewportWidth: 800,
    viewportHeight: 500,

    // Performance
    video: false,
    screenshotOnRunFailure: true,

    // Timeouts
    defaultCommandTimeout: 10000,
    pageLoadTimeout: 30000,
    requestTimeout: 10000,

    // Spec pattern
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
  },
});

