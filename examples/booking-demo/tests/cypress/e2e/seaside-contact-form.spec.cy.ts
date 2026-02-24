// cypress/e2e/contact_form.cy.js

describe('Modern Seaside Stay - Contact form', () => {
  it('fills and submits the contact form', () => {
    // Navigate to the site
    cy.visit('https://appsurify.github.io/modern-seaside-stay/');

    // Go to the Contact section/page
    cy.contains(/contact/i).click();

    // Fill in the contact form fields
    cy.get('input[name="name"], input[placeholder*="Full Name"]').type('Derek Choy');
    cy.get('input[name="email"], input[placeholder*="Email"]').type('test@test');
    cy.get('input[name="phone"], input[placeholder*="Phone Number"]').type('2345');
    cy.get('input[name="subject"], input[placeholder*="Subject"]').type('Test');

    // Add "Test" to the Message box
    cy.get('textarea[name="message"], textarea[placeholder*="Message"], textarea')
      .type('Test');

    // Click the "Send Message" button
    cy.contains('button, [type="submit"]', /send message/i).click();

    // Optional: Assert some success/validation state if the UI shows it
    // cy.contains(/thank you|message sent|we will get back/i).should('be.visible');
  });
});
