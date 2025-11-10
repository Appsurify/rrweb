/// <reference types="cypress" />

/**
 * Custom Cypress commands for simple counter demo
 */

// Counter commands
Cypress.Commands.add('incrementCounter', () => {
  cy.get('#increment-btn').click();
});

Cypress.Commands.add('getCounterValue', () => {
  return cy.get('#counter-value').invoke('text').then(parseInt);
});

// TypeScript declarations
declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Click the increment button
       * @example cy.incrementCounter()
       */
      incrementCounter(): Chainable<void>;
      
      /**
       * Get the current counter value
       * @example cy.getCounterValue().should('equal', 5)
       */
      getCounterValue(): Chainable<number>;
    }
  }
}

export {};

