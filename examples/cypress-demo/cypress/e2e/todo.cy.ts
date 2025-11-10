/**
 * Todo App Tests
 * 
 * Tests for todo functionality with Visual Coverage recording
 */

describe('Todo App', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.navigateTo('todo');
    
    // Clear todos from localStorage
    cy.window().then((win) => {
      win.localStorage.removeItem('visual-coverage-todos');
    });
    
    cy.reload();
  });

  describe('Adding Todos', () => {
    it('should add a new todo', () => {
      cy.addTodo('Buy groceries');
      
      cy.getTodoItems()
        .should('have.length', 1)
        .first()
        .should('contain', 'Buy groceries');
    });

    it('should add multiple todos', () => {
      cy.addTodo('Task 1');
      cy.addTodo('Task 2');
      cy.addTodo('Task 3');
      
      cy.getTodoItems().should('have.length', 3);
    });

    it('should not add empty todo', () => {
      cy.get('#add-todo-btn').click();
      cy.getTodoItems().should('have.length', 0);
    });

    it('should add todo with Enter key', () => {
      cy.get('#todo-input').type('Press Enter{enter}');
      cy.getTodoItems().should('have.length', 1);
    });

    it('should clear input after adding', () => {
      cy.addTodo('Test task');
      cy.get('#todo-input').should('have.value', '');
    });
  });

  describe('Completing Todos', () => {
    beforeEach(() => {
      cy.addTodo('Task to complete');
    });

    it('should mark todo as completed', () => {
      cy.completeTodo(0);
      cy.getTodoItems().first().should('have.class', 'completed');
    });

    it('should show strikethrough for completed todo', () => {
      cy.completeTodo(0);
      cy.get('.todo-text').first().should('have.css', 'text-decoration-line', 'line-through');
    });

    it('should uncheck completed todo', () => {
      cy.completeTodo(0);
      cy.get('.todo-checkbox').first().uncheck();
      cy.getTodoItems().first().should('not.have.class', 'completed');
    });
  });

  describe('Deleting Todos', () => {
    beforeEach(() => {
      cy.addTodo('Task 1');
      cy.addTodo('Task 2');
      cy.addTodo('Task 3');
    });

    it('should delete a todo', () => {
      cy.deleteTodo(1);
      cy.getTodoItems().should('have.length', 2);
    });

    it('should delete all todos', () => {
      cy.deleteTodo(0);
      cy.deleteTodo(0);
      cy.deleteTodo(0);
      cy.getTodoItems().should('have.length', 0);
    });
  });

  describe('Filtering Todos', () => {
    beforeEach(() => {
      cy.addTodo('Active task 1');
      cy.addTodo('Active task 2');
      cy.addTodo('Completed task');
      cy.completeTodo(2);
    });

    it('should show all todos by default', () => {
      cy.get('.filter-btn[data-filter="all"]').should('have.class', 'active');
      cy.getTodoItems().should('have.length', 3);
    });

    it('should filter active todos', () => {
      cy.get('.filter-btn[data-filter="active"]').click();
      cy.getTodoItems().should('have.length', 2);
    });

    it('should filter completed todos', () => {
      cy.get('.filter-btn[data-filter="completed"]').click();
      cy.getTodoItems().should('have.length', 1);
    });

    it('should switch between filters', () => {
      cy.get('.filter-btn[data-filter="active"]').click();
      cy.getTodoItems().should('have.length', 2);
      
      cy.get('.filter-btn[data-filter="completed"]').click();
      cy.getTodoItems().should('have.length', 1);
      
      cy.get('.filter-btn[data-filter="all"]').click();
      cy.getTodoItems().should('have.length', 3);
    });
  });

  describe('Todo Counter', () => {
    it('should show correct count for no todos', () => {
      cy.get('#todo-count').should('contain', '0 items left');
    });

    it('should show correct count for one todo', () => {
      cy.addTodo('Single task');
      cy.get('#todo-count').should('contain', '1 item left');
    });

    it('should show correct count for multiple todos', () => {
      cy.addTodo('Task 1');
      cy.addTodo('Task 2');
      cy.addTodo('Task 3');
      cy.get('#todo-count').should('contain', '3 items left');
    });

    it('should update count when completing todo', () => {
      cy.addTodo('Task 1');
      cy.addTodo('Task 2');
      cy.completeTodo(0);
      cy.get('#todo-count').should('contain', '1 item left');
    });
  });

  describe('Clear Completed', () => {
    beforeEach(() => {
      cy.addTodo('Task 1');
      cy.addTodo('Task 2');
      cy.addTodo('Task 3');
      cy.completeTodo(0);
      cy.completeTodo(2);
    });

    it('should clear completed todos', () => {
      cy.get('#clear-completed-btn').click();
      cy.getTodoItems().should('have.length', 1);
    });

    it('should keep active todos after clearing', () => {
      cy.get('#clear-completed-btn').click();
      cy.getTodoItems().first().should('contain', 'Task 2');
    });
  });

  describe('Persistence', () => {
    it('should persist todos after reload', () => {
      cy.addTodo('Persistent task');
      cy.reload();
      cy.getTodoItems().should('have.length', 1);
    });

    it('should persist completed state', () => {
      cy.addTodo('Task to persist');
      cy.completeTodo(0);
      cy.reload();
      cy.getTodoItems().first().should('have.class', 'completed');
    });
  });
});

