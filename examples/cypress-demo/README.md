# Visual Coverage + Cypress Demo 🎯

Демонстрационный проект, показывающий интеграцию **Visual Coverage** с **Cypress** для записи визуальных сессий UI тестов.

## 🚀 Быстрый старт

### Установка

```bash
# Из корня монорепозитория
cd examples/cypress-demo

# Установить зависимости
yarn install
```

### Запуск

1. **Запустить приложение:**

```bash
yarn dev
```

Приложение будет доступно по адресу: http://localhost:3000

2. **Запустить тесты:**

В другом терминале:

```bash
# Headless режим
yarn test

# С UI (Cypress Test Runner)
yarn test:open

# Headed режим для отладки
yarn test:headed

# С debug логами Visual Coverage
yarn test:debug
```

3. **Просмотр результатов:**

После выполнения тестов, результаты записей будут сохранены в:

```
visual-coverage-reports/
├── sessions/
│   ├── todo-app-should-add-a-new-todo-*.json
│   ├── login-form-should-login-with-valid-credentials-*.json
│   └── ...
└── metadata/
    └── run-info.json
```

---

## 📁 Структура проекта

```
cypress-demo/
├── package.json              # Зависимости и скрипты
├── tsconfig.json            # TypeScript конфиг
├── cypress.config.ts        # Cypress + VC плагин
├── README.md                # Документация
├── app/                     # Тестируемое SPA
│   ├── index.html          # HTML структура
│   ├── styles.css          # Стили
│   └── script.js           # JavaScript логика
└── cypress/
    ├── e2e/                # E2E тесты
    │   ├── todo.cy.ts      # ~24 тестов Todo
    │   ├── login.cy.ts     # ~18 тестов Login
    │   └── navigation.cy.ts # ~14 тестов Navigation
    ├── fixtures/           # Тестовые данные
    │   └── users.json
    └── support/            # Вспомогательные файлы
        ├── e2e.ts         # VC инициализация
        └── commands.ts    # Кастомные команды
```

---

## 🎓 Что демонстрирует этот пример

### ✅ Основы

- Инициализация Visual Coverage в Cypress
- Автоматическая запись тестовых сессий
- Конфигурация плагина в `cypress.config.ts`

### ✅ Различные сценарии

1. **Todo Management** (`todo.cy.ts`) - 24 теста
   - Добавление задач
   - Отметка выполненных
   - Удаление задач
   - Фильтрация списка
   - Счетчик активных задач
   - Persistence в localStorage

2. **User Authentication** (`login.cy.ts`) - 18 тестов
   - Форма входа
   - Валидация
   - Успешная/неуспешная авторизация
   - Multiple login attempts
   - Case sensitivity

3. **Navigation** (`navigation.cy.ts`) - 14 тестов
   - Переходы между страницами
   - Навигационное меню
   - Cross-page functionality
   - Responsive design

**Всего: ~56 тестов**

### ✅ Продвинутые возможности

- Использование fixtures
- Кастомные команды Cypress
- Hooks (beforeEach, afterEach)
- TypeScript декларации
- Debug режим

---

## ⚙️ Конфигурация

### Visual Coverage Options

В файле `cypress/support/e2e.ts`:

```typescript
import { initVisualCoverage } from '@visual-coverage/cypress';

initVisualCoverage({
  debug: process.env.DEBUG_VC === 'true',
  engineConfig: {
    timeoutMs: 5000,
    recordCanvas: true,
    collectFonts: false,
  },
  autoRegisterHooks: true,
});
```

**Параметры:**
- `debug` - включить debug логи
- `engineConfig.timeoutMs` - timeout для инициализации rrweb
- `engineConfig.recordCanvas` - записывать canvas элементы
- `engineConfig.collectFonts` - собирать шрифты
- `autoRegisterHooks` - автоматическая регистрация хуков

### Cypress Plugin Options

В файле `cypress.config.ts`:

```typescript
import { visualCoveragePlugin } from '@visual-coverage/cypress/plugin';

visualCoveragePlugin(on, config, {
  outputDir: './visual-coverage-reports',
  debug: process.env.DEBUG_VC === 'true',
  sessionFormat: 'json',
  compressOutput: false,
});
```

**Параметры:**
- `outputDir` - директория для отчетов
- `debug` - debug режим плагина
- `sessionFormat` - формат сессий ('json' или 'ndjson')
- `compressOutput` - сжимать ли JSON

---

## 🧪 Кастомные команды

Этот пример включает кастомные Cypress команды для удобного тестирования:

### Todo Commands

```typescript
// Добавить задачу
cy.addTodo('Buy milk');

// Получить все задачи
cy.getTodoItems().should('have.length', 3);

// Отметить задачу как выполненную
cy.completeTodo(0);

// Удалить задачу
cy.deleteTodo(1);
```

### Login Commands

```typescript
// Войти с credentials
cy.login('admin', 'password123');

// Войти с "Remember me"
cy.login('admin', 'password123', true);
```

### Navigation Commands

```typescript
// Перейти на страницу
cy.navigateTo('todo');
cy.navigateTo('login');
cy.navigateTo('about');
```

---

## 📊 Отчеты

После запуска тестов, Visual Coverage создает следующую структуру отчетов:

```
visual-coverage-reports/
├── sessions/
│   ├── todo-app-adding-todos-should-add-a-new-todo-1699999999999.json
│   ├── todo-app-completing-todos-should-mark-todo-as-completed-1699999999999.json
│   ├── login-form-successful-login-should-login-with-valid-credentials-1699999999999.json
│   └── ...
└── metadata/
    ├── run-info.json          # Информация о прогоне
    ├── test-mapping.json      # Маппинг тестов и сессий
    └── coverage-summary.json  # Сводка по покрытию
```

### Формат сессии

Каждый JSON файл содержит:

```json
{
  "test": {
    "name": "should add a new todo",
    "fullTitle": "Todo App > Adding Todos > should add a new todo",
    "file": "cypress/e2e/todo.cy.ts",
    "status": "passed",
    "duration": 1234,
    "startedAt": 1699999999999,
    "endedAt": 1699999999999
  },
  "browser": {
    "name": "chrome",
    "version": "120.0.0"
  },
  "spec": {
    "name": "todo.cy.ts",
    "absolute": "/path/to/todo.cy.ts",
    "relative": "cypress/e2e/todo.cy.ts"
  },
  "events": [
    { "type": 4, "timestamp": 100, "data": { "href": "http://localhost:3000" } },
    { "type": 2, "timestamp": 200, "data": { "node": {...} } },
    { "type": 3, "timestamp": 300, "data": { "source": 0 } }
  ]
}
```

**Типы событий rrweb:**
- `type: 0` - DomContentLoaded
- `type: 1` - Load
- `type: 2` - FullSnapshot
- `type: 3` - IncrementalSnapshot
- `type: 4` - Meta
- `type: 5` - Custom

---

## 🔧 Troubleshooting

### Тесты не записываются

1. Проверьте инициализацию в `cypress/support/e2e.ts`
2. Убедитесь, что плагин зарегистрирован в `cypress.config.ts`
3. Включите debug режим: `DEBUG_VC=true yarn test:headed`
4. Проверьте логи в консоли Cypress

### Пустые отчеты

1. Проверьте права доступа к директории `visual-coverage-reports`
2. Убедитесь, что тесты завершаются корректно (не падают преждевременно)
3. Проверьте логи в терминале
4. Попробуйте запустить один тест: `yarn test --spec cypress/e2e/todo.cy.ts`

### Медленные тесты

1. Отключите canvas recording: `recordCanvas: false`
2. Уменьшите timeout: `timeoutMs: 3000`
3. Используйте headless режим: `yarn test`
4. Отключите collectFonts: `collectFonts: false`

### Приложение не запускается

1. Проверьте что порт 3000 свободен: `lsof -i :3000`
2. Попробуйте другой порт: `http-server app -p 3001`
3. Обновите baseUrl в `cypress.config.ts`

### TypeScript ошибки

1. Установите зависимости: `yarn install`
2. Проверьте версию TypeScript: `yarn tsc --version`
3. Очистите кэш: `rm -rf node_modules && yarn install`

---

## 🤝 Использование как шаблон

Этот пример можно использовать как стартовую точку для ваших проектов:

### 1. Скопируйте структуру

```bash
# Создайте новый проект
mkdir my-cypress-project
cd my-cypress-project

# Скопируйте файлы
cp -r ../visual-coverage/examples/cypress-demo/* .
```

### 2. Адаптируйте под свое приложение

- Замените `app/` на ваше приложение (или укажите URL в `baseUrl`)
- Обновите `cypress/e2e/` под ваши тестовые сценарии
- Адаптируйте `cypress/support/commands.ts` под ваши команды

### 3. Настройте конфигурацию

```typescript
// cypress.config.ts
export default defineConfig({
  e2e: {
    baseUrl: 'https://your-app.com', // ваш URL
    // ... остальная конфигурация
  },
});
```

### 4. Запустите тесты

```bash
yarn install
yarn test
```

---

## 📚 Дополнительные ресурсы

- [Visual Coverage Documentation](../../docs/)
- [Cypress Documentation](https://docs.cypress.io)
- [rrweb Documentation](https://www.rrweb.io)
- [Visual Coverage Core Tests](../../packages/core/__tests__/)
- [Visual Coverage Cypress Engine](../../packages/engines/cypress/)

---

## 🎯 Следующие шаги

После изучения этого примера:

1. **Изучите отчеты** - откройте JSON файлы и посмотрите структуру событий
2. **Экспериментируйте** - добавьте свои тесты и команды
3. **Интегрируйте** - используйте Visual Coverage в своих проектах
4. **Поделитесь** - расскажите команде о Visual Coverage

---

## 📝 Лицензия

MIT © Visual Coverage Team

---

## 🙏 Благодарности

- [Cypress](https://www.cypress.io) - за отличный фреймворк для тестирования
- [rrweb](https://www.rrweb.io) - за мощную библиотеку для записи сессий
- Всем контрибьюторам Visual Coverage

---

**Вопросы? Проблемы?** Создайте issue в [GitHub репозитории](https://github.com/whenessel/visual-coverage/issues)

