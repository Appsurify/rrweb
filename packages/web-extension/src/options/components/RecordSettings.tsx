import { useState, useEffect } from 'react';
import {
  AccordionItem,
  AccordionButton,
  Box,
  AccordionIcon,
  AccordionPanel,
  Button,
  FormLabel,
  Radio,
  RadioGroup,
  Switch,
  Stack,
  NumberInput,
  NumberInputField,
  Select,
  FormControl,
  Checkbox,
  useToast,
  Divider,
  Text
} from '@chakra-ui/react';
import Browser from 'webextension-polyfill';
import { SyncDataKey, type RecordSettings, type CheckoutSetting, type ExtensionSettings } from '~/types';

export function RecordSettings({ settings, onChange }: { settings: RecordSettings; onChange: (newSettings: RecordSettings) => void }) {
  const [localSettings, setLocalSettings] = useState<RecordSettings>(settings);
  const toast = useToast();

  // ✅ Обновляем `localSettings` при изменении `settings`
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // ✅ Обновляем `checkoutSetting`
  const handleCheckoutChange = (
    type: 'checkoutEveryNth' | 'checkoutEveryNms' | 'checkoutEveryEvc',
    value: number | boolean
  ) => {
    setLocalSettings((prev) => ({
      ...prev,
      checkoutSetting: { type, value } as CheckoutSetting,
    }));
  };

  // ✅ Обновляем `sampling`
  const handleSamplingChange = (field: keyof RecordSettings['sampling'], value: unknown) => {
    setLocalSettings((prev) => ({
      ...prev,
      sampling: { ...prev.sampling, [field]: value },
    }));
  };

  // ✅ Обновляем `mouseInteraction`
  const handleMouseInteractionChange = (field: keyof RecordSettings['sampling']['mouseInteraction'], value: boolean) => {
    setLocalSettings((prev) => ({
      ...prev,
      sampling: {
        ...prev.sampling,
        mouseInteraction: { ...prev.sampling.mouseInteraction, [field]: value },
      },
    }));
  };

  // ✅ Обновляем `maskInputOptions`
  const handleMaskInputChange = (field: keyof RecordSettings['maskInputOptions'], value: boolean) => {
    setLocalSettings((prev) => ({
      ...prev,
      maskInputOptions: { ...prev.maskInputOptions, [field]: value },
    }));
  };

  // ✅ Сохраняем ТОЛЬКО `recordSettings`, не затрагивая `apiSettings` и `otherSettings`
  const saveSettings = async () => {
    try {
      const storedData = await Browser.storage.sync.get(SyncDataKey.extensionSettings) as { extensionSettings?: ExtensionSettings };
      const updatedSettings: ExtensionSettings = {
        ...storedData.extensionSettings, // Сохраняем существующие API и OtherSettings
        recordSettings: localSettings,  // Обновляем только `recordSettings`
      } as ExtensionSettings;

      await Browser.storage.sync.set({ [SyncDataKey.extensionSettings]: updatedSettings });
      onChange(localSettings);

      toast({ title: 'Settings saved', status: 'success', duration: 3000, isClosable: true });
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast({ title: 'Error', description: 'Failed to save settings.', status: 'error', duration: 3000, isClosable: true });
    }
  };

  return (
    <AccordionItem>
      <AccordionButton>
        <Box flex="1" textAlign="left">🎥 Recording Settings</Box>
        <AccordionIcon />
      </AccordionButton>
      <AccordionPanel pb={4}>
        {/* Full Snapshot Strategy */}
        <FormLabel fontWeight="bold">Full Snapshot Strategy</FormLabel>
        <RadioGroup
          value={localSettings.checkoutSetting.type}
          onChange={(value) => handleCheckoutChange(value as CheckoutSetting['type'], value === 'checkoutEveryEvc' ? true : 1)}
        >
          <Stack spacing={3}>
            <Radio value="checkoutEveryNth">Every N-th Event</Radio>
            {localSettings.checkoutSetting.type === 'checkoutEveryNth' && (
              <NumberInput min={1} value={localSettings.checkoutSetting.value} onChange={(_, value) => handleCheckoutChange('checkoutEveryNth', value)}>
                <NumberInputField />
              </NumberInput>
            )}

            <Radio value="checkoutEveryNms">Every N Milliseconds</Radio>
            {localSettings.checkoutSetting.type === 'checkoutEveryNms' && (
              <NumberInput min={100} value={localSettings.checkoutSetting.value} onChange={(_, value) => handleCheckoutChange('checkoutEveryNms', value)}>
                <NumberInputField />
              </NumberInput>
            )}

            <Radio value="checkoutEveryEvc">Every Event</Radio>
            {localSettings.checkoutSetting.type === 'checkoutEveryEvc' && (
              <Switch isChecked={localSettings.checkoutSetting.value} onChange={(e) => handleCheckoutChange('checkoutEveryEvc', e.target.checked)} />
            )}
          </Stack>
        </RadioGroup>

        <Divider my={4} />

        {/* Sampling Settings */}
        <FormLabel fontWeight="bold" mt={3}>Sampling Settings</FormLabel>
        <FormControl display="flex" alignItems="center" mb={3}>
          <FormLabel mb="0">Mouse Move Recording</FormLabel>
          <Switch isChecked={!!localSettings.sampling.mousemove} onChange={(e) => handleSamplingChange('mousemove', e.target.checked)} />
        </FormControl>

        <Text fontWeight="bold" mt={2} mb={2}>Mouse Interaction</Text>
        <Stack spacing={2}>
          {Object.entries(localSettings.sampling.mouseInteraction).map(([key, value]) => (
            <FormControl key={key} display="flex" alignItems="center">
              <FormLabel mb="0">{key}</FormLabel>
              <Switch isChecked={value} onChange={(e) => handleMouseInteractionChange(key as keyof RecordSettings['sampling']['mouseInteraction'], e.target.checked)} />
            </FormControl>
          ))}
        </Stack>

        <FormControl mt={3}>
          <FormLabel>Scroll Interval (ms)</FormLabel>
          <NumberInput value={localSettings.sampling.scroll || 0} min={0} onChange={(_, value) => handleSamplingChange('scroll', value)}>
            <NumberInputField />
          </NumberInput>
        </FormControl>

        <FormControl mt={3}>
          <FormLabel>Media Interval (ms)</FormLabel>
          <NumberInput value={localSettings.sampling.media || 0} min={0} onChange={(_, value) => handleSamplingChange('media', value)}>
            <NumberInputField />
          </NumberInput>
        </FormControl>

        <FormControl mt={3}>
          <FormLabel>Input Sampling</FormLabel>
          <Select value={String(localSettings.sampling.input)} onChange={(e) => handleSamplingChange('input', e.target.value === 'false' ? false : e.target.value)}>
            <option value="last">Last</option>
            <option value="all">All</option>
            <option value="false">Disabled</option>
          </Select>
        </FormControl>

        <Divider my={4} />

        {/* Mask Input Options */}
        <FormLabel fontWeight="bold" mt={3}>Mask Input Options</FormLabel>
        {Object.entries(localSettings.maskInputOptions).map(([key, value]) => (
          <FormControl key={key} display="flex" alignItems="center" mb={2}>
            <FormLabel mb="0">{key}</FormLabel>
            <Checkbox isChecked={value} onChange={(e) => handleMaskInputChange(key as keyof RecordSettings['maskInputOptions'], e.target.checked)} />
          </FormControl>
        ))}

        <Button mt={6} colorScheme="blue" onClick={() => void saveSettings()} width="100%">
          Save Settings
        </Button>
      </AccordionPanel>
    </AccordionItem>
  );
}
