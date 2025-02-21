// packages/web-extension/test/utils/apiClient.test.ts
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { APIClient, type PaginatedResponse } from '../../src/utils/apiClient';
import type {
  ApiSettings,
  Project,
  TestSuite,
  User,
  Team,
  JWTAuth,
} from '../../src/types';

describe('APIClient', () => {
  let mock: MockAdapter;
  let apiSettings: ApiSettings;
  let client: APIClient;

  beforeEach(() => {
    // Настройки по умолчанию для тестирования
    apiSettings = {
      baseUrl: 'https://api.testmap.appsurify.com',
      authType: {
        type: 'jwt',
        jwtAccessToken: 'initialAccessToken',
        jwtRefreshToken: 'initialRefreshToken',
      } as JWTAuth,
    };

    client = new APIClient(apiSettings);
    // Для доступа к приватному axiosInstance используем приведение типа через any
    mock = new MockAdapter((client as any).axiosInstance);
  });

  afterEach(() => {
    mock.restore();
  });

  it('должен успешно выполнить login и обновить токены', async () => {
    const loginResponse = {
      status: 'success',
      detail: 'User logged in.',
      jwt: {
        access: 'newAccessToken',
        refresh: 'newRefreshToken',
        user: {
          id: 1,
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          avatarUrl: '',
          displayName: 'John Doe',
        } as User,
      },
    };

    mock.onPost('/api/auth/login').reply(200, loginResponse);

    const result = await client.login('john@example.com', 'password123');
    expect(result.jwtAccessToken).toBe('newAccessToken');
    expect(apiSettings.authType.jwtAccessToken).toBe('newAccessToken');
    expect(apiSettings.authType.jwtRefreshToken).toBe('newRefreshToken');
    expect(apiSettings.user).toEqual(loginResponse.jwt.user);
  });

  it('должен выполнить logout и очистить токены и информацию о пользователе', async () => {
    mock.onPost('/api/auth/logout').reply(200, {});
    await client.logout();
    expect(apiSettings.authType).toEqual({ type: 'jwt' });
    expect(apiSettings.user).toBeUndefined();
  });

  it('должен вернуть true при валидации токена', async () => {
    mock.onPost('/api/auth/token/verify').reply(200, { valid: true });
    const isValid = await client.verifyJwtToken('someToken');
    expect(isValid).toBe(true);
  });

  it('должен обновить токен', async () => {
    const refreshResponse = {
      jwtAccessToken: 'refreshedAccessToken',
      jwtRefreshToken: 'refreshedRefreshToken',
    };
    mock.onPost('/api/auth/token/refresh').reply(200, refreshResponse);

    // Обращаемся к приватному методу refreshJwtToken через приведение типа
    const tokens = await (client as any).refreshJwtToken();
    expect(tokens.jwtAccessToken).toBe('refreshedAccessToken');
    expect(tokens.jwtRefreshToken).toBe('refreshedRefreshToken');
  });

  it('должен выбрасывать ошибку, если currentTeam не установлен при формировании URL', () => {
    expect(() => (client as any).getTeamApiUrl('projects')).toThrow(
      'Team is not set in API settings.',
    );
  });

  it('должен получить список проектов', async () => {
    apiSettings.currentTeam = { id: 1, slug: 'team-one', name: 'Team One' };

    const projectsResponse: PaginatedResponse<Project> = {
      count: 2,
      next: null,
      previous: null,
      results: [
        { id: 1, name: 'Project A', teamId: 1 },
        { id: 2, name: 'Project B', teamId: 1 },
      ],
    };

    mock.onGet('/a/team-one/testmap/api/projects').reply(200, projectsResponse);

    const result = await client.fetchProjects();
    expect(result.count).toBe(2);
    expect(result.results).toHaveLength(2);
  });

  it('должен получить тест-сьюты для проекта', async () => {
    apiSettings.currentTeam = { id: 1, slug: 'team-one', name: 'Team One' };

    const testSuitesResponse: PaginatedResponse<TestSuite> = {
      count: 1,
      next: null,
      previous: null,
      results: [{ id: 10, name: 'Suite A', projectId: 1, teamId: 1 }],
    };

    mock
      .onGet('/a/team-one/testmap/api/projects/1/testsuites')
      .reply(200, testSuitesResponse);

    const result = await client.fetchTestSuites(1);
    expect(result.count).toBe(1);
    expect(result.results[0].name).toBe('Suite A');
  });

  it('должен получить список команд', async () => {
    const teamsResponse: PaginatedResponse<Team> = {
      count: 1,
      next: null,
      previous: null,
      results: [{ id: 1, slug: 'team-one', name: 'Team One' }],
    };

    mock.onGet('/api/teams').reply(200, teamsResponse);

    const result = await client.fetchTeams();
    expect(result.results[0].slug).toBe('team-one');
  });

  it('должен обновлять токен при получении 401 и повторять исходный запрос', async () => {
    apiSettings.currentTeam = { id: 1, slug: 'team-one', name: 'Team One' };

    // Первый запрос к проектам возвращает 401
    mock.onGet('/a/team-one/testmap/api/projects').replyOnce(401);

    // Запрос на обновление токена
    const refreshResponse = {
      jwtAccessToken: 'refreshedAccessToken',
      jwtRefreshToken: 'refreshedRefreshToken',
    };
    mock.onPost('/api/auth/token/refresh').reply(200, refreshResponse);

    // Повторный запрос после обновления токена возвращает корректный ответ
    const projectsResponse: PaginatedResponse<Project> = {
      count: 1,
      next: null,
      previous: null,
      results: [{ id: 1, name: 'Project A', teamId: 1 }],
    };
    mock.onGet('/a/team-one/testmap/api/projects').reply(200, projectsResponse);

    const result = await client.fetchProjects();
    expect(result.results).toHaveLength(1);
    expect(apiSettings.authType.jwtAccessToken).toBe('refreshedAccessToken');
  });
});
