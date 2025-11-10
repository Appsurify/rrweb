/**
 * Simple Counter Test
 * 
 * Test for counter functionality with Visual Coverage recording
 */

describe('Simple Counter App', () => {
  beforeEach(() => {
    // Visit the app
    cy.visit('/');
    
    // Clear counter from localStorage
    cy.window().then((win) => {
      win.localStorage.removeItem('simple-counter');
    });
    
    cy.reload();
  });

  it('should increment counter on button click', () => {
    // Check initial value
    cy.get('#counter-value').should('have.text', '0');
    
    // Click button once
    cy.incrementCounter();
    cy.get('#counter-value').should('have.text', '1');
    
    // Click button again
    cy.incrementCounter();
    cy.get('#counter-value').should('have.text', '2');
    
    // Click button multiple times
    cy.incrementCounter();
    cy.incrementCounter();
    cy.incrementCounter();
    cy.get('#counter-value').should('have.text', '5');
  });

  it('should persist counter value after reload', () => {
    // Increment counter
    cy.incrementCounter();
    cy.incrementCounter();
    cy.incrementCounter();
    cy.get('#counter-value').should('have.text', '3');
    
    // Reload page
    cy.reload();
    
    // Counter should persist
    cy.get('#counter-value').should('have.text', '3');
  });

  it('should use custom command to get counter value', () => {
    // Increment several times
    cy.incrementCounter();
    cy.incrementCounter();
    cy.incrementCounter();
    cy.incrementCounter();
    
    // Check value using custom command
    cy.getCounterValue().should('equal', 4);
  });
});

