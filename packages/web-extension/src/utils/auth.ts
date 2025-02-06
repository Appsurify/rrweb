import Browser from 'webextension-polyfill';
import { SyncDataKey, type ApiSettings, type ExtensionSettings, type User } from '~/types';
import { defaultExtensionSettings } from "~/utils/settings";

// ✅ Определяем интерфейс для ожидаемых данных от API
interface LoginResponse {
  jwt: {
    access: string;
    refresh: string;
    user: User;
  };
}

export async function login(email: string, password: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.testmap.appsurify.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const data: LoginResponse = (await response.json()) as LoginResponse; // ✅ Указываем ожидаемый тип

    const newSettings: Partial<ApiSettings> = {
      jwtAccessToken: data.jwt.access,
      jwtRefreshToken: data.jwt.refresh,
      user: data.jwt.user,
      authMethod: 'jwt', // ✅ Теперь authMethod всегда корректного типа
    };

    await updateApiSettings(newSettings);
    return true;
  } catch (error) {
    console.error('Login error:', error);
    return false;
  }
}

export async function refreshToken(): Promise<boolean> {
  try {
    const storedData = await Browser.storage.sync.get(SyncDataKey.extensionSettings) as { extensionSettings?: ExtensionSettings };
    const { jwtRefreshToken } = storedData.extensionSettings?.apiSettings || {};

    if (!jwtRefreshToken) return false;

    const response = await fetch('https://api.testmap.appsurify.com/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: jwtRefreshToken }),
    });

    if (!response.ok) return false;

    // ✅ Добавляем интерфейс для ожидаемого типа ответа
    interface RefreshTokenResponse {
      access: string;
    }

    const data: RefreshTokenResponse = (await response.json()) as RefreshTokenResponse; // ✅ Теперь TypeScript знает структуру

    await updateApiSettings({ jwtAccessToken: data.access });
    return true;
  } catch (error) {
    console.error('Refresh token error:', error);
    return false;
  }
}

export async function logout() {
  await updateApiSettings({ jwtAccessToken: '', jwtRefreshToken: '', user: undefined });
}

async function updateApiSettings(newSettings: Partial<ApiSettings>) {
  const storedData = await Browser.storage.sync.get(SyncDataKey.extensionSettings) as { extensionSettings?: ExtensionSettings };

  // ✅ Гарантируем, что `recordSettings` и `otherSettings` не будут `undefined`
  const updatedSettings: ExtensionSettings = {
    recordSettings: storedData.extensionSettings?.recordSettings ?? defaultExtensionSettings.recordSettings,
    otherSettings: storedData.extensionSettings?.otherSettings ?? defaultExtensionSettings.otherSettings,
    apiSettings: {
      ...storedData.extensionSettings?.apiSettings,
      ...newSettings,
      authMethod: storedData.extensionSettings?.apiSettings?.authMethod || 'jwt', // ✅ Исправляем ошибку типа
    },
  };

  await Browser.storage.sync.set({ [SyncDataKey.extensionSettings]: updatedSettings });
}
