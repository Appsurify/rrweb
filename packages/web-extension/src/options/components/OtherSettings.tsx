import { useState, useEffect } from 'react';
import {
  AccordionItem,
  AccordionButton,
  Box,
  AccordionIcon,
  AccordionPanel,
  FormControl,
  FormLabel,
  Switch,
  Button,
  useToast,
  Divider,
} from '@chakra-ui/react';
import Browser from 'webextension-polyfill';
import { SyncDataKey, type OtherSettings, type ExtensionSettings } from '~/types';

export function OtherSettings({ settings, onChange }: { settings: OtherSettings; onChange: (newSettings: OtherSettings) => void }) {
  const [localSettings, setLocalSettings] = useState<OtherSettings>(settings);
  const toast = useToast();

  // ✅ Обновляем `localSettings`, если `settings` изменяются
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // ✅ Обновляем настройки (например, режим отладки)
  const handleSettingChange = (field: keyof OtherSettings, value: boolean) => {
    setLocalSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // ✅ Сохраняем только `otherSettings`, не изменяя другие настройки
  const saveSettings = async () => {
    try {
      const storedData = await Browser.storage.sync.get(SyncDataKey.extensionSettings) as { extensionSettings?: ExtensionSettings };
      const updatedSettings: ExtensionSettings = {
        ...storedData.extensionSettings, // Сохраняем API и RecordSettings
        otherSettings: localSettings,   // Обновляем только OtherSettings
      } as ExtensionSettings;

      await Browser.storage.sync.set({ [SyncDataKey.extensionSettings]: updatedSettings });
      onChange(localSettings);

      toast({ title: 'Other Settings Saved', status: 'success', duration: 3000, isClosable: true });
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast({ title: 'Error', description: 'Failed to save settings.', status: 'error', duration: 3000, isClosable: true });
    }
  };

  return (
    <AccordionItem>
      <AccordionButton>
        <Box flex="1" textAlign="left">⚙️ Other Settings</Box>
        <AccordionIcon />
      </AccordionButton>
      <AccordionPanel pb={4}>
        <FormControl display="flex" alignItems="center" mb={4}>
          <FormLabel mb="0">Enable Debug Mode</FormLabel>
          <Switch isChecked={localSettings.enableDebugMode} onChange={(e) => handleSettingChange('enableDebugMode', e.target.checked)} />
        </FormControl>

        <Divider my={4} />

        <Button colorScheme="blue" onClick={() => void saveSettings()} width="100%">
          Save Other Settings
        </Button>
      </AccordionPanel>
    </AccordionItem>
  );
}
