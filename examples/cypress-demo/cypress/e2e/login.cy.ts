/**
 * Login Form Tests
 * 
 * Tests for authentication with Visual Coverage recording
 */

describe('Login Form', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.navigateTo('login');
  });

  describe('Form Elements', () => {
    it('should display login form', () => {
      // Check if Visual Coverage is loaded
      cy.window().then((win) => {
        console.log('[TEST] Checking VC initialization...', win);
        console.log('[TEST] Cypress object:', Cypress);
        console.log('[TEST] Mocha before hooks count:', (before as any).length);
      });
      
      cy.get('#login-form').should('be.visible');
      cy.get('#username').should('be.visible');
      cy.get('#password').should('be.visible');
      cy.get('button[type="submit"]').should('contain', 'Login');
    });

    it('should have required fields', () => {
      cy.get('#username').should('have.attr', 'required');
      cy.get('#password').should('have.attr', 'required');
    });

    it('should have remember checkbox', () => {
      cy.get('#remember').should('exist');
      cy.get('label').contains('Remember me').should('be.visible');
    });
  });

  describe('Successful Login', () => {
    it('should login with valid credentials', () => {
      cy.fixture('users').then((users) => {
        cy.login(users.validUser.username, users.validUser.password);
        cy.get('#login-success').should('be.visible').and('contain', 'Welcome back');
      });
    });

    it('should login with remember me checked', () => {
      cy.fixture('users').then((users) => {
        cy.login(users.testUser.username, users.testUser.password, true);
        cy.get('#login-success').should('contain', 'Remembered');
      });
    });

    it('should clear form after successful login', () => {
      cy.fixture('users').then((users) => {
        cy.login(users.demoUser.username, users.demoUser.password);
        cy.wait(2100); // Wait for auto-clear
        cy.get('#username').should('have.value', '');
        cy.get('#password').should('have.value', '');
      });
    });
  });

  describe('Failed Login', () => {
    it('should show error for invalid credentials', () => {
      cy.fixture('users').then((users) => {
        cy.login(users.invalidUser.username, users.invalidUser.password);
        cy.get('#login-error').should('be.visible').and('contain', 'Invalid username or password');
      });
    });

    it('should show error for empty username', () => {
      cy.get('#password').type('somepassword');
      cy.get('#login-form').submit();
      cy.get('#login-error').should('be.visible');
    });

    it('should show error for empty password', () => {
      cy.get('#username').type('someuser');
      cy.get('#login-form').submit();
      cy.get('#login-error').should('be.visible');
    });

    it('should not clear form after failed login', () => {
      cy.fixture('users').then((users) => {
        cy.login(users.invalidUser.username, users.invalidUser.password);
        cy.get('#username').should('have.value', users.invalidUser.username);
      });
    });
  });

  describe('Multiple Login Attempts', () => {
    it('should handle multiple failed attempts', () => {
      cy.login('wrong1', 'wrong1');
      cy.get('#login-error').should('be.visible');
      
      cy.get('#username').clear();
      cy.get('#password').clear();
      
      cy.login('wrong2', 'wrong2');
      cy.get('#login-error').should('be.visible');
    });

    it('should succeed after failed attempt', () => {
      cy.login('wrong', 'wrong');
      cy.get('#login-error').should('be.visible');
      
      cy.get('#username').clear();
      cy.get('#password').clear();
      
      cy.fixture('users').then((users) => {
        cy.login(users.validUser.username, users.validUser.password);
        cy.get('#login-success').should('be.visible');
      });
    });
  });

  describe('Form Interactions', () => {
    it('should allow typing in username field', () => {
      const username = 'testuser';
      cy.get('#username').type(username).should('have.value', username);
    });

    it('should mask password input', () => {
      cy.get('#password').should('have.attr', 'type', 'password');
    });

    it('should toggle remember checkbox', () => {
      cy.get('#remember').check().should('be.checked');
      cy.get('#remember').uncheck().should('not.be.checked');
    });

    it('should submit form with Enter key', () => {
      cy.fixture('users').then((users) => {
        cy.get('#username').type(users.validUser.username);
        cy.get('#password').type(`${users.validUser.password}{enter}`);
        cy.get('#login-success').should('be.visible');
      });
    });
  });

  describe('Form Validation', () => {
    it('should trim whitespace from username', () => {
      cy.get('#username').type('  admin  ');
      cy.get('#password').type('password123');
      cy.get('#login-form').submit();
      // Should fail because of whitespace
      cy.get('#login-error').should('be.visible');
    });

    it('should be case-sensitive for username', () => {
      cy.login('ADMIN', 'password123');
      cy.get('#login-error').should('be.visible');
    });

    it('should be case-sensitive for password', () => {
      cy.login('admin', 'PASSWORD123');
      cy.get('#login-error').should('be.visible');
    });
  });
});

