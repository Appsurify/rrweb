import { useEffect, useState } from 'react';
import { SettingsLayout } from '~/options/components/SettingsLayout';
import { RecordSettings } from '~/options/components/RecordSettings';
import { ApiSettings } from '~/options/components/ApiSettings';
import { OtherSettings } from '~/options/components/OtherSettings';
import Browser from 'webextension-polyfill';
import { SyncDataKey, type ExtensionSettings } from '~/types';
import { defaultExtensionSettings } from '~/utils/settings';

export function SettingsPage() {
  const [settings, setSettings] = useState<ExtensionSettings>(defaultExtensionSettings);

  useEffect(() => {
    void (async () => {
      try {
        const storedData = await Browser.storage.sync.get(SyncDataKey.extensionSettings) as { extensionSettings?: ExtensionSettings };
        if (storedData.extensionSettings) {
          setSettings(storedData.extensionSettings);
        }
      } catch (error) {
        console.error('Failed to retrieve settings:', error);
      }
    })();
  }, []);

  // ✅ Функция обновляет только изменённую часть `settings`
  const handleSettingsChange = (updatedPart: Partial<ExtensionSettings>) => {
    setSettings((prev) => {
      const newSettings = { ...prev, ...updatedPart };

      // Автосохранение изменений в `chrome.storage.sync`
      void Browser.storage.sync.set({ [SyncDataKey.extensionSettings]: newSettings });

      return newSettings;
    });
  };

  return (
    <SettingsLayout>
      <RecordSettings
        settings={settings.recordSettings}
        onChange={(newRecordSettings) => handleSettingsChange({ recordSettings: newRecordSettings })}
      />
      <ApiSettings
        settings={settings.apiSettings}
        onChange={(newApiSettings) => handleSettingsChange({ apiSettings: newApiSettings })}
      />
      <OtherSettings
        settings={settings.otherSettings}
        onChange={(newOtherSettings) => handleSettingsChange({ otherSettings: newOtherSettings })}
      />
    </SettingsLayout>
  );
}
