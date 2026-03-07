// cypress/e2e/testmap_early_access.cy.js

describe('TestMap Early Access signup', () => {
  it('clicks the Sign up for Early Access button', () => {
    cy.visit('https://www.testmap.io/');

    // Wait for page/main content to load
    cy.get('body').should('be.visible');

    // Click by visible text (works for <a>, <button>, etc.)
    cy.contains(/sign up for early access/i)
      .should('be.visible')
      .click();

    // Optional: assert that we navigated to the Early Access page or form
    cy.url().should('include', 'early-access');
  });
});