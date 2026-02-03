describe('Modern Seaside Stay', () => {
  it('Simple booking form', function() {
    cy.visit('https://appsurify.github.io/modern-seaside-stay');
    cy.get('#root div.hidden a.bg-primary').click();
    cy.get('#root div:nth-child(3) > div.p-6 > div.items-center > button.border').click();
    cy.get('#root div.flex.mt-8 button.bg-primary').click();
    cy.get('#firstName').type('Artem');
    cy.get('#lastName').type('Demidenko');
    cy.get('#email').type('ar.demidenko@appsurify.com');
    if (Math.random() > 0.5) {
      cy.get('#phone').type('+380501234567');
    }
    if (Math.random() > 0.5) {
      cy.get('#address').type('123 Beach Street');
    }
    if (Math.random() > 0.5) {
      cy.get('#city').type('Seaside');
    }
    if (Math.random() > 0.5) {
      cy.get('#zipCode').type('12345');
    }
    if (Math.random() > 0.5) {
      cy.get('#country').type('USA');
    }
    if (Math.random() > 0.5) {
      cy.get('#specialRequests').type('Late checkout please');
    }
    cy.get('#cardName').type('Artem Demidenko');
    cy.get('#cardNumber').type('4111111111111111');
    cy.get('#cardExpiry').type('12/25');
    cy.get('#cardCvc').type('123');
    cy.get('button[class*="text-primary-foreground"]').click();

    cy.get('#terms').check();
    cy.get('#root button.bg-primary').click();
  });
});





