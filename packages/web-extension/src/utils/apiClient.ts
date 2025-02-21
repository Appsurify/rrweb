// src/utils/apiClient.ts
import axios from 'axios';
import type {
  AxiosInstance,
  AxiosResponse,
  AxiosError,
  AxiosRequestConfig,
} from 'axios';
import type {
  ApiSettings,
  Project,
  TestSuite,
  User,
  Team,
  Session,
  SendSessionResponse,
  PaginatedResponse,
  LoginResponse,
} from '~/types';
import type { eventWithTime } from '@appsurify-testmap/rrweb-types';
import { settingsManager } from '~/utils/settingsManager';

// Extend the request configuration type by adding the _retry field
interface AxiosRequestConfigWithRetry extends AxiosRequestConfig {
  _retry?: boolean;
}

export class APIClient {
  private static instance: APIClient;
  private axiosInstance: AxiosInstance;
  private isRefreshing = false;
  private refreshSubscribers: ((token: string) => void)[] = [];

  private constructor() {
    // Create an axios instance without a hard-coded baseURL; it will be set in the interceptor.
    this.axiosInstance = axios.create();

    // Request interceptor: update the base URL and authorization header from the current settings.
    this.axiosInstance.interceptors.request.use((config) => {
      const currentApiSettings = settingsManager.getSettings().apiSettings;
      config.baseURL = currentApiSettings.baseUrl;
      config.headers = config.headers || {};
      if (currentApiSettings.authType) {
        if (
          currentApiSettings.authType.type === 'jwt' &&
          currentApiSettings.authType.jwtAccessToken
        ) {
          config.headers.Authorization = `Bearer ${currentApiSettings.authType.jwtAccessToken}`;
        } else if (
          currentApiSettings.authType.type === 'personalToken' &&
          currentApiSettings.authType.token
        ) {
          config.headers.Authorization = `Api-Key ${currentApiSettings.authType.token}`;
        }
      }
      return config;
    });

    // Response interceptor: on a 401 for JWT, try to refresh the token.
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as AxiosRequestConfigWithRetry | undefined;
        if (!originalRequest) return Promise.reject(error);

        const currentApiSettings = settingsManager.getSettings().apiSettings;
        if (
          error.response &&
          error.response.status === 401 &&
          currentApiSettings.authType?.type === 'jwt' &&
          !originalRequest._retry
        ) {
          originalRequest._retry = true;
          try {
            if (this.isRefreshing) {
              const newToken = await new Promise<string>((resolve) => {
                this.refreshSubscribers.push(resolve);
              });
              this.setAuthHeader(originalRequest, newToken);
              return this.axiosInstance(originalRequest);
            }
            this.isRefreshing = true;
            const newTokens = await this.refreshJwtToken();
            console.debug('Refreshed tokens:', newTokens);

            // Update the global settings via settingsManager
            const updatedApiSettings: ApiSettings = {
              ...currentApiSettings,
              authType: {
                type: 'jwt',
                jwtAccessToken: newTokens.jwtAccessToken,
                jwtRefreshToken: newTokens.jwtRefreshToken,
              },
            };
            await settingsManager.updateApiSettings(updatedApiSettings);

            this.refreshSubscribers.forEach((callback) =>
              callback(newTokens.jwtAccessToken),
            );
            this.refreshSubscribers = [];

            this.setAuthHeader(originalRequest, newTokens.jwtAccessToken);
            return this.axiosInstance(originalRequest);
          } catch (err) {
            return Promise.reject(err);
          } finally {
            this.isRefreshing = false;
          }
        }
        return Promise.reject(error);
      },
    );
  }

  public static getInstance(): APIClient {
    if (!APIClient.instance) {
      APIClient.instance = new APIClient();
    }
    return APIClient.instance;
  }

  private setAuthHeader(config: AxiosRequestConfigWithRetry, token: string): void {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  private async refreshJwtToken(): Promise<{
    jwtAccessToken: string;
    jwtRefreshToken: string;
  }> {
    const currentApiSettings = settingsManager.getSettings().apiSettings;
    if (
      !currentApiSettings.authType ||
      currentApiSettings.authType.type !== 'jwt' ||
      !currentApiSettings.authType.jwtRefreshToken
    ) {
      throw new Error('No valid refresh token available.');
    }
    try {
      const response: AxiosResponse<{
        access: string;
        access_expiration: string;
      }> = await this.axiosInstance.post('/api/auth/token/refresh', {
        refresh: currentApiSettings.authType.jwtRefreshToken,
      });
      return {
        jwtAccessToken: response.data.access,
        // If the server does not return a new refresh token, keep the old one.
        jwtRefreshToken: currentApiSettings.authType.jwtRefreshToken,
      };
    } catch (error) {
      console.error('Token refresh error', error);
      throw error;
    }
  }

  // === Methods for authentication ===

  public async login(
    email: string,
    password: string,
  ): Promise<{ jwtAccessToken: string; jwtRefreshToken: string; user: User }> {
    const response = await this.axiosInstance.post<LoginResponse>(
      '/api/auth/login',
      { email, password },
    );
    const { access, refresh, user } = response.data.jwt;
    const currentApiSettings = settingsManager.getSettings().apiSettings;
    const updatedApiSettings: ApiSettings = {
      ...currentApiSettings,
      authType: { type: 'jwt', jwtAccessToken: access, jwtRefreshToken: refresh },
      user,
    };
    await settingsManager.updateApiSettings(updatedApiSettings);
    return { jwtAccessToken: access, jwtRefreshToken: refresh, user };
  }

  public async logout(): Promise<void> {
    await this.axiosInstance.post('/api/auth/logout');
    const currentApiSettings = settingsManager.getSettings().apiSettings;
    const updatedApiSettings: ApiSettings = {
      ...currentApiSettings,
      authType: { type: 'jwt' },
      user: undefined,
    };
    await settingsManager.updateApiSettings(updatedApiSettings);
  }

  public async verifyJwtToken(token: string): Promise<boolean> {
    try {
      const response: AxiosResponse<{ valid: boolean }> =
        await this.axiosInstance.post('/api/auth/token/verify', { token });
      return response.data.valid;
    } catch {
      return false;
    }
  }

  public async verifyPersonalToken(): Promise<boolean> {
    try {
      const response: AxiosResponse<User> = await this.axiosInstance.get('/api/auth/user/me');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  public async fetchUserData(): Promise<User> {
    const response: AxiosResponse<User> = await this.axiosInstance.get('/api/auth/user/me');
    const currentApiSettings = settingsManager.getSettings().apiSettings;
    const updatedApiSettings: ApiSettings = {
      ...currentApiSettings,
      user: response.data,
    };
    await settingsManager.updateApiSettings(updatedApiSettings);
    return response.data;
  }

  // === Methods bound to team ===

  public async fetchProjects(
    limit = 100,
    offset = 0,
  ): Promise<PaginatedResponse<Project>> {
    const currentApiSettings = settingsManager.getSettings().apiSettings;
    if (!currentApiSettings.currentTeam?.slug) {
      throw new Error('Team is not set in API settings.');
    }
    const url = `/a/${currentApiSettings.currentTeam.slug}/testmap/api/projects`;
    const response: AxiosResponse<PaginatedResponse<Project>> =
      await this.axiosInstance.get(url, { params: { limit, offset } });
    return response.data;
  }

  public async fetchTestSuites(
    projectId: number,
    limit = 100,
    offset = 0,
  ): Promise<PaginatedResponse<TestSuite>> {
    const currentApiSettings = settingsManager.getSettings().apiSettings;
    if (!currentApiSettings.currentTeam?.slug) {
      throw new Error('Team is not set in API settings.');
    }
    const url = `/a/${currentApiSettings.currentTeam.slug}/testmap/api/projects/${projectId}/testsuites`;
    const response: AxiosResponse<PaginatedResponse<TestSuite>> =
      await this.axiosInstance.get(url, { params: { limit, offset } });
    return response.data;
  }

  public async fetchTeams(
    limit = 100,
    offset = 0,
  ): Promise<PaginatedResponse<Team>> {
    const response: AxiosResponse<PaginatedResponse<Team>> =
      await this.axiosInstance.get('/api/teams', { params: { limit, offset } });
    return response.data;
  }

  public async sendSession(
    session: Session,
    events: eventWithTime[],
  ): Promise<SendSessionResponse> {
    const currentApiSettings = settingsManager.getSettings().apiSettings;
    if (!currentApiSettings.currentTeam?.slug) {
      throw new Error('Team is not set in API settings.');
    }
    const url = `/a/${currentApiSettings.currentTeam.slug}/testmap/api/rrweb/record/sessions`;
    const payload = {
      "project_name": session.metadata.projectName || '',
      "testsuite_name": session.metadata.testSuiteName || '',
      "testcase_name": session.metadata.testCaseName || '',
      "testrun_name": session.metadata.testRunName || '',
      "session_key": session.id,
      "session_metadata": session.metadata,
      "session_name": session.name,
      "session_recorder_version": session.recorderVersion,
      "session_create_timestamp": session.createTimestamp,
      "session_modify_timestamp": session.modifyTimestamp,
      "session_events": events,
    };
    const response = await this.axiosInstance.post<SendSessionResponse>(url, payload);
    return response.data;
  }
}

// Export APIClient as a named singleton
export const apiClient = APIClient.getInstance();
