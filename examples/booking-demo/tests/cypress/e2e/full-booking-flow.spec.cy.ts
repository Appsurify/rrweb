
describe('Book Deluxe Sea View Suite', () => {
  it('completes the full booking flow', () => {
    // Navigate to the site
    cy.visit('https://appsurify.github.io/modern-seaside-stay/');
    // NOTE: Checked out (Meta + FullSnapshot)Checked out (Meta + FullSnapshot)
    // Click "Book Your Stay" on the landing page
    cy.contains(/book your stay/i).click();

    // NOTE: Checked out (Meta + FullSnapshot) REASON: Next page (navigation)
    // Click the "Selected" button that matches the given element
    cy.contains('button.inline-flex.items-center.justify-center', 'Select').click();

    // NOTE: Try dont if possible Checked out (Meta + FullSnapshot) REASON: big scroll to page bottom
    // Continue to guest information
    cy.contains(/continue/i).click();

    // NOTE: Checked out (Meta + FullSnapshot) REASON: Because changing step (like tabs)
    // Guest information
    cy.get('input[placeholder*="First Name"], input[name="firstName"]').type('Derek');
    cy.get('input[placeholder*="Last Name"], input[name="lastName"]').type('Choy');
    cy.get('input[placeholder*="Email"], input[name="email"]').type('test@test.com');
    cy.get('input[placeholder*="Phone"], input[name="phone"]').type('1234');
    cy.get('input[placeholder*="Address"], input[name="address"]').type('Test');
    cy.get('input[placeholder*="City"], input[name="city"]').type('Test');
    cy.get('input[placeholder*="Zip Code"], input[name="zipCode"]').type('12345');
    cy.get('input[placeholder*="Country"], input[name="country"]').type('Test');

    // NOTE: Not required but maybe Checked out (Meta + FullSnapshot) REASON: Big scroll to page bottom
    // Payment information
    cy.get('input[placeholder*="Name on Card"], input[name="cardName"]').type('Derek Choy');
    cy.get('input[placeholder*="Card Number"], input[name="cardNumber"]').type('1234');
    cy.get('input[placeholder*="Expiry Date"], input[name="cardExpiry"]').type('10/30');
    cy.get('input[placeholder*="CVC"], input[name="cardCvc"]').type('123');

    // Review & Confirm
    cy.contains(/review & confirm/i).click();

    // NOTE: Checked out (Meta + FullSnapshot) REASON: Because changing step (like tabs)
    // Confirm booking
    cy.contains(/confirm booking/i).click();

    // NOTE: Checked out (Meta + FullSnapshot)  REASON: Because rerender form
    // Assert booking success (adjust the text to match the actual success message)
    cy.contains(/booking confirmed|thank you for your booking|reservation complete/i)
      .should('be.visible');
  });
});
