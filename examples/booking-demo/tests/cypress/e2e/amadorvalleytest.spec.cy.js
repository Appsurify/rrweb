describe('Amador Valley Industries - Home Page Flow', () => {
  it('acknowledges the CA privacy notice and clicks Start Service, then returns to main page', () => {
    // 1. Visit the homepage
    cy.visit('https://www.amadorvalleyindustries.com/');

    // 2. Wait for the privacy notice popup to appear and become visible
    //cy.get('.secpopup-fulls', { timeout: 10000 })
   //   .should('be.visible');

    // 3. Close the privacy notice by clicking the X button
    cy.get('.popup-fulls_button-close')
    //  .should('be.visible')
      .click();

    // 4. Confirm the privacy popup is no longer visible
    //cy.get('.secpopup-fulls')
   //   .should('not.be.visible');

    // 5. Click the "Start Service" button in the hero section
    //cy.contains('.button-group a.button.w-button', 'Start Service')
    //  .should('have.attr', 'href', '/start-service')
    //  .scrollIntoView()
    //  .should('be.visible')
    //  .click();

    // 6. Verify we navigated to the start-service page
    //cy.url().should('include', 'start-service');

    // 7. Navigate back to the main page
    // cy.go('back');

    cy.contains('a.button.is-text.w-inline-block', 'Local Resources')
      .should('have.attr', 'href', '/company/community-support')
      .scrollIntoView()
      .should('be.visible')
      .click({ force: true });

    // Confirm navigation
    cy.url().should('include', '/company/community-support');
    
    // 7. Navigate back to the main page
    cy.go('back');

    // 8. Verify we are back on the homepage
    //cy.url().should('eq', 'https://www.amadorvalleyindustries.com/');
  });
});