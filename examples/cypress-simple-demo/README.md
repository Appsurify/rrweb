# Visual Coverage - Simple Cypress Demo

Простой демо-проект для демонстрации интеграции Visual Coverage с Cypress.

## 📋 Описание

Это минималистичное приложение-счётчик с одной кнопкой и одним тестом. Идеально подходит для быстрого ознакомления с Visual Coverage.

## 🎯 Функциональность

- **Простая страница** с одной кнопкой
- **Счётчик** увеличивается на +1 при каждом клике
- **Сохранение состояния** в localStorage
- **Один E2E тест** проверяет работу счётчика

## 🚀 Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

или

```bash
yarn install
```

### 2. Запуск приложения

```bash
npm run dev
```

Приложение откроется на `http://localhost:3001`

### 3. Запуск тестов

В отдельном терминале:

```bash
# Headless режим
npm test

# С открытым браузером
npm run test:headed

# Интерактивный режим
npm run test:open

# С отладкой Visual Coverage
npm run test:debug
```

## 📁 Структура проекта

```
cypress-simple-demo/
├── app/
│   ├── index.html       # Главная страница
│   ├── script.js        # Логика счётчика
│   └── styles.css       # Стили
├── cypress/
│   ├── e2e/
│   │   └── counter.cy.ts   # Тест счётчика
│   └── support/
│       ├── e2e.ts          # Инициализация VC
│       └── commands.ts     # Custom команды
├── cypress.config.ts    # Конфигурация Cypress
├── package.json         # Зависимости
└── tsconfig.json        # TypeScript конфигурация
```

## 🧪 Тесты

Файл `cypress/e2e/counter.cy.ts` содержит три теста:

1. **Увеличение счётчика** - проверяет, что клик по кнопке увеличивает значение
2. **Сохранение состояния** - проверяет, что счётчик сохраняется после перезагрузки
3. **Custom команды** - демонстрирует использование кастомных Cypress команд

## 📊 Visual Coverage отчёты

После запуска тестов отчёты сохраняются в директории `visual-coverage-reports/`:

```
visual-coverage-reports/
├── sessions/
│   └── [test-session].json
└── index.html
```

Откройте `visual-coverage-reports/index.html` в браузере для просмотра записанных сессий.

## 🛠️ Скрипты

- `npm run dev` - Запустить dev-сервер на порту 3001
- `npm test` - Запустить тесты в headless режиме
- `npm run test:open` - Открыть Cypress Test Runner
- `npm run test:headed` - Запустить тесты с видимым браузером
- `npm run test:debug` - Запустить с отладочной информацией VC
- `npm run clean` - Удалить отчёты и артефакты тестов

## 🔧 Конфигурация Visual Coverage

Visual Coverage настроен в двух местах:

1. **Plugin** (`cypress.config.ts`):
```typescript
visualCoveragePlugin(on, config, {
  outputDir: './visual-coverage-reports',
  debug: true,
  sessionFormat: 'json',
  compressOutput: false,
});
```

2. **Adapter** (`cypress/support/e2e.ts`):
```typescript
initVisualCoverage({
  debug: true,
  engineConfig: {
    timeoutMs: 5000,
    debug: true,
  },
  autoRegisterHooks: true,
});
```

## 📚 Сравнение с полной демо

Этот проект - упрощённая версия `cypress-demo`:

| Функция | cypress-demo | cypress-simple-demo |
|---------|--------------|---------------------|
| Страниц | 3 (Todo, Login, About) | 1 (Counter) |
| Тестов | 3 файла (~20 тестов) | 1 файл (3 теста) |
| Компонентов | Todo list, форма логина | Одна кнопка |
| Строк кода | ~800 | ~200 |

## 🎓 Следующие шаги

После ознакомления с этим примером:

1. Изучите полный пример в `examples/cypress-demo`
2. Ознакомьтесь с документацией в `docs/`
3. Интегрируйте Visual Coverage в свой проект

## 📝 Лицензия

MIT

