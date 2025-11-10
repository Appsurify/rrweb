// Состояние приложения
let counter = 0;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    initCounter();
    loadCounterFromStorage();
});

// Инициализация счётчика
function initCounter() {
    const btn = document.getElementById('increment-btn');
    const counterDisplay = document.getElementById('counter-value');
    
    btn.addEventListener('click', () => {
        incrementCounter();
    });
}

// Увеличение счётчика
function incrementCounter() {
    counter++;
    updateDisplay();
    saveCounterToStorage();
}

// Обновление отображения
function updateDisplay() {
    const counterDisplay = document.getElementById('counter-value');
    counterDisplay.textContent = counter;
}

// Сохранение в localStorage
function saveCounterToStorage() {
    try {
        localStorage.setItem('simple-counter', counter.toString());
    } catch (e) {
        console.error('Failed to save counter:', e);
    }
}

// Загрузка из localStorage
function loadCounterFromStorage() {
    try {
        const stored = localStorage.getItem('simple-counter');
        if (stored !== null) {
            counter = parseInt(stored, 10) || 0;
            updateDisplay();
        }
    } catch (e) {
        console.error('Failed to load counter:', e);
    }
}

