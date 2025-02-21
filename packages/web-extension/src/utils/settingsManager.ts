// src/utils/settingsManager.ts
import Browser from 'webextension-polyfill';
import { defaultExtensionSettings } from './settingsDefaults';
import { SyncDataKey } from '~/types';
import type {
  ExtensionSettings,
  ApiSettings,
  RecordSettings,
  OtherSettings,
} from '~/types';

class SettingsManager {
  private static instance: SettingsManager;
  private settings: ExtensionSettings = defaultExtensionSettings;
  private subscribers: Array<(settings: ExtensionSettings) => void> = [];

  private constructor() {
    Browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes[SyncDataKey.extensionSettings]) {
        const newSettings = changes[SyncDataKey.extensionSettings]
          .newValue as ExtensionSettings;
        this.settings = newSettings;
        this.notifySubscribers();
      }
    });
  }

  public static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  public async load(): Promise<void> {
    const stored = await Browser.storage.sync.get(
      SyncDataKey.extensionSettings,
    );
    if (stored[SyncDataKey.extensionSettings]) {
      this.settings = stored[
        SyncDataKey.extensionSettings
      ] as ExtensionSettings;
    } else {
      this.settings = defaultExtensionSettings;
      await Browser.storage.sync.set({
        [SyncDataKey.extensionSettings]: this.settings,
      });
    }
    this.notifySubscribers();
  }
  public getSettings(): ExtensionSettings {
    return this.settings;
  }

  public async updateSettings(
    newSettings: Partial<ExtensionSettings>,
  ): Promise<void> {
    this.settings = { ...this.settings, ...newSettings };
    await Browser.storage.sync.set({
      [SyncDataKey.extensionSettings]: this.settings,
    });
    this.notifySubscribers();
  }

  public async updateApiSettings(
    newApiSettings: Partial<ApiSettings>,
  ): Promise<void> {
    const updatedApiSettings = {
      ...this.settings.apiSettings,
      ...newApiSettings,
    };
    this.settings = { ...this.settings, apiSettings: updatedApiSettings };
    await Browser.storage.sync.set({
      [SyncDataKey.extensionSettings]: this.settings,
    });
    this.notifySubscribers();
  }


  public async updateRecordSettings(
    newRecordSettings: Partial<RecordSettings>,
  ): Promise<void> {
    const updatedRecordSettings = {
      ...this.settings.recordSettings,
      ...newRecordSettings,
    };
    this.settings = { ...this.settings, recordSettings: updatedRecordSettings };
    await Browser.storage.sync.set({
      [SyncDataKey.extensionSettings]: this.settings,
    });
    this.notifySubscribers();
  }

  public async updateOtherSettings(
    newOtherSettings: Partial<OtherSettings>,
  ): Promise<void> {
    const updatedOtherSettings = {
      ...this.settings.otherSettings,
      ...newOtherSettings,
    };
    this.settings = { ...this.settings, otherSettings: updatedOtherSettings };
    await Browser.storage.sync.set({
      [SyncDataKey.extensionSettings]: this.settings,
    });
    this.notifySubscribers();
  }

  public subscribe(callback: (settings: ExtensionSettings) => void): void {
    this.subscribers.push(callback);
  }


  public unsubscribe(callback: (settings: ExtensionSettings) => void): void {
    this.subscribers = this.subscribers.filter((cb) => cb !== callback);
  }

  private notifySubscribers(): void {
    this.subscribers.forEach((cb) => cb(this.settings));
  }
}

export const settingsManager = SettingsManager.getInstance();
