/**
 * Navigation Tests
 * 
 * Tests for page navigation with Visual Coverage recording
 */

describe('Navigation', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  describe('Nav Links', () => {
    it('should display all navigation links', () => {
      cy.get('.nav-link').should('have.length', 3);
      cy.get('.nav-link').eq(0).should('contain', 'Todo');
      cy.get('.nav-link').eq(1).should('contain', 'Login');
      cy.get('.nav-link').eq(2).should('contain', 'About');
    });

    it('should have Todo as active by default', () => {
      cy.get('.nav-link[data-page="todo"]').should('have.class', 'active');
      cy.get('#page-todo').should('have.class', 'active');
    });
  });

  describe('Page Switching', () => {
    it('should navigate to Login page', () => {
      cy.navigateTo('login');
      cy.get('.nav-link[data-page="login"]').should('have.class', 'active');
      cy.get('#page-login').should('have.class', 'active');
      cy.get('#login-form').should('be.visible');
    });

    it('should navigate to About page', () => {
      cy.navigateTo('about');
      cy.get('.nav-link[data-page="about"]').should('have.class', 'active');
      cy.get('#page-about').should('have.class', 'active');
      cy.contains('About Visual Coverage').should('be.visible');
    });

    it('should navigate back to Todo page', () => {
      cy.navigateTo('login');
      cy.navigateTo('todo');
      cy.get('.nav-link[data-page="todo"]').should('have.class', 'active');
      cy.get('#page-todo').should('have.class', 'active');
    });
  });

  describe('Sequential Navigation', () => {
    it('should navigate through all pages in order', () => {
      cy.navigateTo('login');
      cy.get('#login-form').should('be.visible');
      
      cy.navigateTo('about');
      cy.contains('About Visual Coverage').should('be.visible');
      
      cy.navigateTo('todo');
      cy.get('#todo-input').should('be.visible');
    });

    it('should maintain active state during navigation', () => {
      const pages: Array<'todo' | 'login' | 'about'> = ['todo', 'login', 'about'];
      
      pages.forEach(page => {
        cy.navigateTo(page);
        cy.get('.nav-link').not(`[data-page="${page}"]`).should('not.have.class', 'active');
        cy.get(`.nav-link[data-page="${page}"]`).should('have.class', 'active');
      });
    });
  });

  describe('Page Content', () => {
    it('should hide inactive pages', () => {
      cy.navigateTo('login');
      cy.get('#page-todo').should('not.have.class', 'active');
      cy.get('#page-about').should('not.have.class', 'active');
    });

    it('should show only one page at a time', () => {
      cy.navigateTo('about');
      cy.get('.page.active').should('have.length', 1);
    });
  });

  describe('Navigation Interactions', () => {
    it('should not break state when rapidly switching pages', () => {
      cy.navigateTo('login');
      cy.navigateTo('about');
      cy.navigateTo('todo');
      cy.navigateTo('login');
      
      cy.get('.nav-link[data-page="login"]').should('have.class', 'active');
      cy.get('#page-login').should('be.visible');
    });

    it('should handle click on already active link', () => {
      cy.navigateTo('todo');
      cy.navigateTo('todo');
      
      cy.get('.nav-link[data-page="todo"]').should('have.class', 'active');
      cy.get('#page-todo').should('be.visible');
    });
  });

  describe('Cross-Page Functionality', () => {
    it('should preserve todo data when navigating away and back', () => {
      cy.addTodo('Test task');
      cy.navigateTo('about');
      cy.navigateTo('todo');
      cy.getTodoItems().should('have.length', 1);
    });

    it('should allow login after todo interaction', () => {
      cy.addTodo('Task before login');
      cy.navigateTo('login');
      
      cy.fixture('users').then((users) => {
        cy.login(users.validUser.username, users.validUser.password);
        cy.get('#login-success').should('be.visible');
      });
    });

    it('should navigate to about and read content', () => {
      cy.navigateTo('about');
      cy.contains('Visual Coverage').should('be.visible');
      cy.contains('sessions').should('be.visible'); // Check for content that's actually in the page
      cy.get('.feature-list li').should('have.length.at.least', 3);
    });
  });

  describe('External Links', () => {
    it('should have GitHub link in about page', () => {
      cy.navigateTo('about');
      cy.get('a[href*="github"]').should('exist');
    });
  });

  describe('Responsive Navigation', () => {
    it('should display navigation on mobile viewport', () => {
      cy.viewport('iphone-x');
      cy.get('.nav').should('be.visible');
      cy.get('.nav-link').should('have.length', 3);
    });

    it('should navigate on mobile', () => {
      cy.viewport(375, 667);
      cy.navigateTo('login');
      cy.get('#login-form').should('be.visible');
    });
  });
});

