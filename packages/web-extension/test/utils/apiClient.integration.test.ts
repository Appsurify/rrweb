// packages/web-extension/test/utils/apiClient.integration.test.ts
import { APIClient } from '../../src/utils/apiClient';
import type { ApiSettings, Project, Team, JWTAuth } from '../../src/types';

const TEST_BASE_URL = process.env.TEST_API_BASE_URL || 'http://localhost:8000';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Qwerty#123';

// Убедитесь, что на тестовом сервере существует команда с таким slug
const TEST_TEAM: Team = { id: 1, slug: 'appsurify', name: 'Appsurify' };

/**
 * Выполняет авторизацию, если в настройках ещё не установлен токен.
 */
async function ensureLogin(client: APIClient, settings: ApiSettings) {
  if (!(settings.authType as JWTAuth).jwtAccessToken) {
    const loginResponse = await client.login(TEST_EMAIL, TEST_PASSWORD);
    expect(loginResponse.jwtAccessToken).toBeTruthy();
  }
}

describe('APIClient Integration Tests', () => {
  let client: APIClient;
  let apiSettings: ApiSettings;

  beforeAll(() => {
    // Инициализируем настройки для интеграционных тестов
    apiSettings = {
      baseUrl: TEST_BASE_URL,
      authType: {
        type: 'jwt',
        jwtAccessToken: '',
        jwtRefreshToken: '',
      },
      currentTeam: TEST_TEAM,
      connectionTimeout: 5000, // Устанавливаем тайм-аут соединения
    };

    client = new APIClient(apiSettings);
  });

  it('должен успешно выполнить login на тестовом сервере', async () => {
    const loginResponse = await client.login(TEST_EMAIL, TEST_PASSWORD);

    expect(loginResponse.jwtAccessToken).toBeTruthy();
    expect(loginResponse.jwtRefreshToken).toBeTruthy();
    expect(loginResponse.user).toBeDefined();

    // Проверяем, что токены сохраняются в apiSettings.authType
    expect((apiSettings.authType as JWTAuth).jwtAccessToken).toBe(
      loginResponse.jwtAccessToken,
    );
    expect((apiSettings.authType as JWTAuth).jwtRefreshToken).toBe(
      loginResponse.jwtRefreshToken,
    );
  });

  it('должен получить список проектов с тестового сервера', async () => {
    await ensureLogin(client, apiSettings);

    const projectsResponse = await client.fetchProjects(10, 0);
    expect(typeof projectsResponse.count).toBe('number');
    expect(Array.isArray(projectsResponse.results)).toBe(true);

    if (projectsResponse.count > 0) {
      const project: Project = projectsResponse.results[0];
      expect(project).toHaveProperty('id');
      expect(project).toHaveProperty('name');
    }
  });

  it('должен получить тест-сьюты для первого проекта', async () => {
    await ensureLogin(client, apiSettings);

    const projectsResponse = await client.fetchProjects(10, 0);
    if (projectsResponse.count === 0) {
      return fail('На тестовом сервере не найдено ни одного проекта');
    }

    const project: Project = projectsResponse.results[0];
    const testSuitesResponse = await client.fetchTestSuites(project.id, 10, 0);

    expect(typeof testSuitesResponse.count).toBe('number');
    expect(Array.isArray(testSuitesResponse.results)).toBe(true);
  });

  it('должен получить список команд', async () => {
    // Здесь авторизация не требуется, так как эндпоинт /api/teams не привязан к команде.
    const teamsResponse = await client.fetchTeams(10, 0);

    expect(typeof teamsResponse.count).toBe('number');
    expect(Array.isArray(teamsResponse.results)).toBe(true);
  });
});
