
describe('Navigation Snapshot Validation', () => {
  it('produces snapshots across multiple SPA navigations', () => {
    // 1. Visit landing page
    cy.visit('https://appsurify.github.io/modern-seaside-stay/');
    cy.contains(/MareSereno|seaside/i).should('be.visible');

    // 2. Navigate to Apartments via navbar
    cy.get('nav').contains(/apartments/i).click();
    cy.url().should('include', '/apartments');
    cy.contains(/our apartments|browse/i).should('be.visible');

    // 3. Navigate to Amenities via navbar
    cy.get('nav').contains(/amenities/i).click();
    cy.url().should('include', '/amenities');
    cy.contains(/amenities/i).should('be.visible');

    // 4. Navigate to Gallery via navbar
    cy.get('nav').contains(/gallery/i).click();
    cy.url().should('include', '/gallery');
    cy.contains(/gallery/i).should('be.visible');

    // 5. Navigate to Contact via navbar
    cy.get('nav').contains(/contact/i).click();
    cy.url().should('include', '/contact');
    cy.contains(/contact/i).should('be.visible');

    // 6. Navigate back to Home via navbar
    cy.get('nav').contains(/home/i).click();
    cy.url().should('match', /\/modern-seaside-stay\/?$/);
    cy.contains(/MareSereno|seaside/i).should('be.visible');
  });
});
