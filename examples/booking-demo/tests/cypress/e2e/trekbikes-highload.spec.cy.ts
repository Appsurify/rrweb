/// <reference types="cypress" />
// Cypress port of tests/playwright/e2e/trekbikes-highload.spec.ts.
// Verifies the rrweb-cypress-plugin records a heavy, CDN-driven site and that
// stylesheets are inlined (inlineStylesheet: 'all') under chromeWebSecurity:false.

const BASE_URL = 'https://www.trekbikes.com/us/en_US/';

// SKIPPED: trekbikes.com does not fire its `load` event behind Cypress's proxy,
// and cy.visit() has no way to settle for anything less (Playwright uses
// waitUntil:'domcontentloaded' and Selenium has its own budget — both record this
// page fine). Verified NOT to be our plugin: with initializeTestmap() removed
// from cypress/support/e2e.ts, a bare cy.visit(BASE_URL) still times out waiting
// for `load`. Raising the timeout to 120s does not help — the event never comes.
// Re-enable if Cypress gains a domcontentloaded-style visit or Trek's page changes.
// eslint-disable-next-line mocha/no-skipped-tests
describe.skip('Trek Bikes - Homepage (~20% of visible/interactive elements)', () => {
  // trekbikes.com's own scripts throw "Failed to execute 'postMessage' on
  // 'MessagePort': CustomEvent object could not be cloned". Cypress fails a test
  // on any uncaught exception from the application, so a third-party bug on the
  // site under test aborts the run before we can record it. Playwright and
  // Selenium record the same page fine — the error is not ours (nothing in rrweb
  // posts a CustomEvent through a MessagePort). Swallow it: this spec exists to
  // exercise the recorder on a heavy site, not to police Trek's JS.
  Cypress.on('uncaught:exception', () => false);

  beforeEach(() => {
    // trekbikes.com is deliberately the "highload" case: a CDN-heavy page whose
    // `load` event routinely takes longer than Cypress's 60s pageLoadTimeout
    // default, especially with inlineStylesheet:'all' fetching every sheet.
    // Playwright/Selenium run the same page with a 120s budget.
    cy.visit(BASE_URL, { timeout: 120_000 });
    cy.wait(1500);
    // Dismiss cookie/consent banner if present (best-effort, non-fatal)
    cy.get('body').then(($body) => {
      const btn = $body.find('#CybotCookiebotDialogBodyButtonAccept');
      if (btn.length) {
        cy.wrap(btn.first()).click({ force: true });
      }
    });
  });

  // --- Header / Logo ---
  it('Trek logo is visible and links to homepage', () => {
    cy.get('a[aria-label="Trek Bikes home page"]')
      .first()
      .should('have.attr', 'href')
      .and('include', 'trekbikes.com');
  });

  it('Electra brand link navigates to Electra site', () => {
    cy.get('a[aria-label="Shop Electra"]')
      .first()
      .should('have.attr', 'href')
      .and('include', 'electra');
  });
});
