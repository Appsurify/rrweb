// cypress/e2e/book_deluxe_sea_view_suite.cy.js

describe('Book Deluxe Sea View Suite', () => {
  it('completes the full booking flow', () => {
    // Navigate to the site
    cy.visit('https://appsurify.github.io/modern-seaside-stay/');

    // Click "Book Your Stay" on the landing page
    cy.contains(/book your stay/i).click();

    // Click the "Selected" button that matches the given element
    cy.contains('button.inline-flex.items-center.justify-center', 'Select').click();

    // Continue to guest information
    cy.contains(/continue/i).click();

    // Guest information
    cy.get('input[placeholder*="First Name"], input[name="firstName"]').type('Derek');
    cy.get('input[placeholder*="Last Name"], input[name="lastName"]').type('Choy');
    cy.get('input[placeholder*="Email"], input[name="email"]').type('test@test.com');
    cy.get('input[placeholder*="Phone"], input[name="phone"]').type('1234');
    cy.get('input[placeholder*="Address"], input[name="address"]').type('Test');
    cy.get('input[placeholder*="City"], input[name="city"]').type('Test');
    cy.get('input[placeholder*="Zip Code"], input[name="zipCode"]').type('12345');
    cy.get('input[placeholder*="Country"], input[name="country"]').type('Test');

    // Payment information
    cy.get('input[placeholder*="Name on Card"], input[name="cardName"]').type('Derek Choy');
    cy.get('input[placeholder*="Card Number"], input[name="cardNumber"]').type('1234');
    cy.get('input[placeholder*="Expiry Date"], input[name="cardExpiry"]').type('10/30');
    cy.get('input[placeholder*="CVC"], input[name="cardCvc"]').type('123');

    // Review & Confirm
    cy.contains(/review & confirm/i).click();

    // Confirm booking
    cy.contains(/confirm booking/i).click();

    // Assert booking success (adjust the text to match the actual success message)
    cy.contains(/booking confirmed|thank you for your booking|reservation complete/i)
      .should('be.visible');
  });
});