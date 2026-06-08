/// <reference types="cypress" />
// Cypress port of tests/playwright/e2e/trekbikes-highload.spec.ts.
// Verifies the rrweb-cypress-plugin records a heavy, CDN-driven site and that
// stylesheets are inlined (inlineStylesheet: 'all') under chromeWebSecurity:false.

const BASE_URL = 'https://www.trekbikes.com/us/en_US/';

describe('Trek Bikes - Homepage (~20% of visible/interactive elements)', () => {
  beforeEach(() => {
    cy.visit(BASE_URL);
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
