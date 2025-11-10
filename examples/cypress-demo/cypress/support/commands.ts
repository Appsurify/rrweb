/// <reference types="cypress" />

/**
 * Custom Cypress commands for demo app
 */

// Todo commands
Cypress.Commands.add('addTodo', (text: string) => {
  cy.get('#todo-input').type(text);
  cy.get('#add-todo-btn').click();
});

Cypress.Commands.add('getTodoItems', () => {
  return cy.get('.todo-item');
});

Cypress.Commands.add('completeTodo', (index: number) => {
  cy.get('.todo-item').eq(index).find('.todo-checkbox').check();
});

Cypress.Commands.add('deleteTodo', (index: number) => {
  cy.get('.todo-item').eq(index).find('.todo-delete').click();
});

// Login commands
Cypress.Commands.add('login', (username: string, password: string, remember: boolean = false) => {
  cy.get('#username').type(username);
  cy.get('#password').type(password);
  
  if (remember) {
    cy.get('#remember').check();
  }
  
  cy.get('#login-form').submit();
});

// Navigation commands
Cypress.Commands.add('navigateTo', (page: 'todo' | 'login' | 'about') => {
  cy.get(`.nav-link[data-page="${page}"]`).click();
});

// TypeScript declarations
declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Add a new todo item
       * @example cy.addTodo('Buy milk')
       */
      addTodo(text: string): Chainable<void>;
      
      /**
       * Get all todo items
       * @example cy.getTodoItems().should('have.length', 3)
       */
      getTodoItems(): Chainable<JQuery<HTMLElement>>;
      
      /**
       * Mark a todo as completed
       * @example cy.completeTodo(0)
       */
      completeTodo(index: number): Chainable<void>;
      
      /**
       * Delete a todo item
       * @example cy.deleteTodo(0)
       */
      deleteTodo(index: number): Chainable<void>;
      
      /**
       * Login with credentials
       * @example cy.login('admin', 'password123', true)
       */
      login(username: string, password: string, remember?: boolean): Chainable<void>;
      
      /**
       * Navigate to a page
       * @example cy.navigateTo('about')
       */
      navigateTo(page: 'todo' | 'login' | 'about'): Chainable<void>;
    }
  }
}

export {};

