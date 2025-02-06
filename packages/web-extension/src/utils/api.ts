import Browser from 'webextension-polyfill';
import { SyncDataKey, type ExtensionSettings } from '~/types';
import { refreshToken } from './auth';


const API_BASE_URL = 'https://api.testmap.appsurify.com/api/';

/**
 * Получает заголовки для аутентификации (JWT или API Key)
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const storedData = await Browser.storage.sync.get(SyncDataKey.extensionSettings) as { extensionSettings?: ExtensionSettings };
  const apiSettings = storedData.extensionSettings?.apiSettings;

  if (!apiSettings) throw new Error('API settings not found');

  if (apiSettings.authMethod === 'apiKey' && apiSettings.apiKey) {
    return { Authorization: `Api-Key ${apiSettings.apiKey}` };
  }

  if (apiSettings.authMethod === 'jwt' && apiSettings.jwtAccessToken) {
    return { Authorization: `Bearer ${apiSettings.jwtAccessToken}` };
  }

  throw new Error('No valid authentication method found');
}


/**
 * Выполняет API-запрос с аутентификацией и повторяет запрос при `401 Unauthorized`
 */
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders();
  options.headers = {
    ...options.headers,
    ...headers,
    'Content-Type': 'application/json',
  };

  const response = await fetch(API_BASE_URL + endpoint, options);

  if (response.status === 401) {
    const refreshed = await refreshToken();
    if (refreshed) {
      return request<T>(endpoint, options); // 🔄 Повторяем запрос с обновлённым токеном
    }
  }

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} - ${response.statusText}`);
  }

  return (await response.json()) as T;
}



export const apiClient = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, body: unknown) => request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(endpoint: string, body: unknown) => request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};
