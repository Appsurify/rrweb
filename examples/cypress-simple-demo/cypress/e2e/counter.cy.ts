/**
 * Feedback Form Test
 *
 * Test for feedback form functionality with Visual Coverage recording
 */

describe('Feedback Form App', () => {
  beforeEach(() => {
    // Visit the app
    cy.visit('/');
  });

  it('should fill all form fields and enable submit button', () => {
    // Verify initial state - submit button should be disabled
    cy.get('#submit-btn').should('be.disabled');

    // Fill First Name
    cy.get('#firstName')
      .type('John')


    // Submit button should still be disabled
    cy.get('#submit-btn').should('be.disabled');

    // Fill Last Name
    cy.get('#lastName')
      .type('Smith')


    // Submit button should still be disabled
    cy.get('#submit-btn').should('be.disabled');

    // Fill Position
    cy.get('#position')
      .type('Software Engineer')


    // Submit button should still be disabled
    cy.get('#submit-btn').should('be.disabled');

    // Fill Country
    cy.get('#country')
      .type('United States')


    // Submit button should still be disabled
    cy.get('#submit-btn').should('be.disabled');

    // Fill Industry
    cy.get('#industry')
      .type('Technology')


    // Submit button should still be disabled
    cy.get('#submit-btn').should('be.disabled');

    // Fill Date
    const today = new Date();
    const dateString = today.toISOString().split('T')[0];
    cy.get('#date')
      .type(dateString)


    // Submit button should still be disabled (message field is empty)
    cy.get('#submit-btn').should('be.disabled');

    // Fill Message
    cy.get('#message')
      .type('This is a test message for the feedback form. I am testing the form validation and submit button activation.')


    // Now submit button should be enabled
    cy.get('#submit-btn').should('not.be.disabled');

    // Verify all fields have values
    // cy.get('#firstName')
    // cy.get('#lastName')
    // cy.get('#position')
    // cy.get('#country')
    // cy.get('#industry')
    // cy.get('#date')
    // cy.get('#message').should('contain.value', 'This is a test message');
  });

  it('should disable submit button when a field is cleared', () => {
    // Fill all fields first
    cy.get('#firstName').type('John');
    cy.get('#lastName').type('Smith');
    cy.get('#position').type('Software Engineer');
    cy.get('#country').type('United States');
    cy.get('#industry').type('Technology');

    const today = new Date();
    const dateString = today.toISOString().split('T')[0];
    cy.get('#date').type(dateString);
    cy.get('#message').type('Test message');

    // Verify button is enabled
    cy.get('#submit-btn').should('not.be.disabled');

    // Clear one field
    cy.get('#firstName').clear();

    // Button should be disabled again
    cy.get('#submit-btn').should('be.disabled');
  });

  it('should verify header elements are present', () => {
    cy.get('.app-title').should('contain', 'Testmap Demo App');
    cy.get('.nav-button').contains('Feedback');
    cy.get('.nav-button').contains('Admin');
  });
});
