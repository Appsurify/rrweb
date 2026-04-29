describe('Dublin Cyclery navigation', () => {
  it('goes to Repairs, then returns home', () => {
    cy.visit('https://www.dublincyclery.com/');

    cy.contains('a', /repairs/i)
      .should('be.visible')
      .click();

    cy.url().should('include', '/repair-services/');

    cy.go('back');

    cy.url().should('eq', 'https://www.dublincyclery.com/');
  });
});