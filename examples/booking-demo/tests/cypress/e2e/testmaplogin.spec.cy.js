describe('Login test', () => {
  it('logs in with email and password', () => {
    cy.visit('https://derek.dev.testmap.cloud/auth');

    cy.get('input[type="email"], input[name="email"]')
      .first()
      .type('derek@appsurify.com');

    cy.get('input[type="password"], input[name="password"]')
      .first()
      .type('test1234');

    cy.contains('button, [type="submit"]', 'Log In').click();

        cy.contains('Test 32', { timeout: 10000 })
      .should('be.visible')
      .click();
  });
});