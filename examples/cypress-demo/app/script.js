// App State
const state = {
    todos: [],
    currentFilter: 'all',
    currentPage: 'todo',
};

// Demo users for login
const DEMO_USERS = {
    'admin': 'password123',
    'user': 'test123',
    'demo': 'demo123',
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initTodoApp();
    initLoginForm();
    loadTodosFromStorage();
});

// Navigation
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            switchPage(page);
        });
    });
}

function switchPage(pageName) {
    // Update nav
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.page === pageName);
    });
    
    // Update pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.toggle('active', page.id === `page-${pageName}`);
    });
    
    state.currentPage = pageName;
}

// Todo App
function initTodoApp() {
    const input = document.getElementById('todo-input');
    const addBtn = document.getElementById('add-todo-btn');
    const list = document.getElementById('todo-list');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const clearBtn = document.getElementById('clear-completed-btn');
    
    // Add todo
    addBtn.addEventListener('click', () => addTodo());
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTodo();
    });
    
    // Filter todos
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentFilter = btn.dataset.filter;
            renderTodos();
        });
    });
    
    // Clear completed
    clearBtn.addEventListener('click', clearCompleted);
}

function addTodo() {
    const input = document.getElementById('todo-input');
    const text = input.value.trim();
    
    if (!text) return;
    
    const todo = {
        id: Date.now(),
        text,
        completed: false,
        createdAt: new Date().toISOString(),
    };
    
    state.todos.push(todo);
    input.value = '';
    saveTodosToStorage();
    renderTodos();
}

function toggleTodo(id) {
    const todo = state.todos.find(t => t.id === id);
    if (todo) {
        todo.completed = !todo.completed;
        saveTodosToStorage();
        renderTodos();
    }
}

function deleteTodo(id) {
    state.todos = state.todos.filter(t => t.id !== id);
    saveTodosToStorage();
    renderTodos();
}

function clearCompleted() {
    state.todos = state.todos.filter(t => !t.completed);
    saveTodosToStorage();
    renderTodos();
}

function renderTodos() {
    const list = document.getElementById('todo-list');
    const countEl = document.getElementById('todo-count');
    
    // Filter todos
    let filtered = state.todos;
    if (state.currentFilter === 'active') {
        filtered = state.todos.filter(t => !t.completed);
    } else if (state.currentFilter === 'completed') {
        filtered = state.todos.filter(t => t.completed);
    }
    
    // Render list
    list.innerHTML = filtered.map(todo => `
        <li class="todo-item ${todo.completed ? 'completed' : ''}" data-id="${todo.id}">
            <input 
                type="checkbox" 
                class="todo-checkbox" 
                ${todo.completed ? 'checked' : ''}
                onchange="toggleTodo(${todo.id})"
            >
            <span class="todo-text">${escapeHtml(todo.text)}</span>
            <button class="todo-delete" onclick="deleteTodo(${todo.id})">Delete</button>
        </li>
    `).join('');
    
    // Update count
    const activeCount = state.todos.filter(t => !t.completed).length;
    countEl.textContent = `${activeCount} item${activeCount !== 1 ? 's' : ''} left`;
}

// Login Form
function initLoginForm() {
    const form = document.getElementById('login-form');
    
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleLogin();
    });
}

function handleLogin() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const remember = document.getElementById('remember').checked;
    const errorEl = document.getElementById('login-error');
    const successEl = document.getElementById('login-success');
    
    // Hide messages
    errorEl.style.display = 'none';
    successEl.style.display = 'none';
    
    // Validate
    if (!username || !password) {
        showError('Please fill in all fields');
        return;
    }
    
    // Check credentials
    if (DEMO_USERS[username] === password) {
        showSuccess(`Welcome back, ${username}! ${remember ? '(Remembered)' : ''}`);
        
        // Clear form after 2s
        setTimeout(() => {
            document.getElementById('login-form').reset();
            successEl.style.display = 'none';
        }, 2000);
    } else {
        showError('Invalid username or password. Try: admin/password123');
    }
}

function showError(message) {
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function showSuccess(message) {
    const successEl = document.getElementById('login-success');
    successEl.textContent = message;
    successEl.style.display = 'block';
}

// Storage
function saveTodosToStorage() {
    try {
        localStorage.setItem('visual-coverage-todos', JSON.stringify(state.todos));
    } catch (e) {
        console.error('Failed to save todos:', e);
    }
}

function loadTodosFromStorage() {
    try {
        const stored = localStorage.getItem('visual-coverage-todos');
        if (stored) {
            state.todos = JSON.parse(stored);
            renderTodos();
        }
    } catch (e) {
        console.error('Failed to load todos:', e);
    }
}

// Utility
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Expose functions to window for inline event handlers
window.toggleTodo = toggleTodo;
window.deleteTodo = deleteTodo;

