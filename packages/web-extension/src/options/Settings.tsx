import { useEffect, useState } from 'react';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControl,
  FormLabel,
  Input,
  NumberInput,
  NumberInputField,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Switch,
  Text,
  useToast,
} from '@chakra-ui/react';
import Browser from 'webextension-polyfill';
import { SyncDataKey, type Settings, type SyncData, defaultSettings, type CheckoutSetting } from '~/types';

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const toast = useToast();

  useEffect(() => {
    void (async () => {
      try {
        const storedData = (await Browser.storage.sync.get(SyncDataKey.settings)) as SyncData;
        if (storedData.settings) {
          setSettings((prev) => ({
            ...prev,
            ...storedData.settings,
            sampling: {
              ...defaultSettings.sampling,
              ...storedData.settings.sampling,
            },
            maskInputOptions: {
              ...defaultSettings.maskInputOptions,
              ...storedData.settings.maskInputOptions,
            },
            checkoutSetting: storedData.settings.checkoutSetting || defaultSettings.checkoutSetting,
          }));
        }
      } catch (error) {
        console.error('Failed to retrieve settings:', error);
        toast({
          title: 'Error',
          description: 'Failed to retrieve settings.',
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
      }
    })();
  }, [toast]);

  const handleSamplingChange = (field: keyof Settings['sampling'], value: unknown) => {
    setSettings((prev) => ({
      ...prev,
      sampling: {
        ...prev.sampling,
        [field]: value,
      },
    }));
  };

  const handleMouseInteractionChange = (field: keyof Settings['sampling']['mouseInteraction'], value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      sampling: {
        ...prev.sampling,
        mouseInteraction: {
          ...prev.sampling.mouseInteraction,
          [field]: value,
        },
      },
    }));
  };

  const handleMaskInputChange = (field: keyof Settings['maskInputOptions'], value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      maskInputOptions: {
        ...prev.maskInputOptions,
        [field]: value,
      },
    }));
  };

  const handleCheckoutChange = (
    type: 'checkoutEveryNth' | 'checkoutEveryNms' | 'checkoutEveryEvc',
    value: number | boolean
  ) => {
    setSettings((prev) => ({
      ...prev,
      checkoutSetting: { type, value } as CheckoutSetting,
    }));
  };

  const saveSettings = async () => {
    try {
      await Browser.storage.sync.set({ [SyncDataKey.settings]: settings });
      toast({
        title: 'Settings saved',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save settings.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  return (
    <Box p={6} maxW="800px" mx="auto">
      <Text fontSize="2xl" fontWeight="bold" mb={4}>
        Recording Settings
      </Text>

      <Accordion allowMultiple>
        {/* Full Snapshot Strategy */}
        <AccordionItem>
          <AccordionButton>
            <Box flex="1" textAlign="left">
              Full Snapshot Strategy
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel pb={4}>
            <RadioGroup
              value={settings.checkoutSetting.type}
              onChange={(value) => {
                if (value === 'checkoutEveryNth') {
                  handleCheckoutChange('checkoutEveryNth', 1);
                } else if (value === 'checkoutEveryNms') {
                  handleCheckoutChange('checkoutEveryNms', 100);
                } else if (value === 'checkoutEveryEvc') {
                  handleCheckoutChange('checkoutEveryEvc', true);
                }
              }}
            >
              <Stack spacing={3}>
                <Radio value="checkoutEveryNth">Every N-th Event</Radio>
                {settings.checkoutSetting.type === 'checkoutEveryNth' && (
                  <Input
                    type="number"
                    value={settings.checkoutSetting.value}
                    min={1}
                    onChange={(e) => handleCheckoutChange('checkoutEveryNth', Number(e.target.value))}
                  />
                )}

                <Radio value="checkoutEveryNms">Every N Milliseconds</Radio>
                {settings.checkoutSetting.type === 'checkoutEveryNms' && (
                  <Input
                    type="number"
                    value={settings.checkoutSetting.value}
                    min={100}
                    onChange={(e) => handleCheckoutChange('checkoutEveryNms', Number(e.target.value))}
                  />
                )}

                <Radio value="checkoutEveryEvc">Every Event</Radio>
                {settings.checkoutSetting.type === 'checkoutEveryEvc' && (
                  <Switch
                    isChecked={settings.checkoutSetting.value}
                    onChange={(e) => handleCheckoutChange('checkoutEveryEvc', e.target.checked)}
                  />
                )}
              </Stack>
            </RadioGroup>
          </AccordionPanel>
        </AccordionItem>

        <Divider my={4} />

        {/* Sampling Settings */}
        <AccordionItem>
          <AccordionButton>
            <Box flex="1" textAlign="left">
              Sampling Settings
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel pb={4}>
            <FormControl display="flex" alignItems="center" mb={3}>
              <FormLabel mb="0">Track Visibility Changes</FormLabel>
              <Switch
                isChecked={
                  typeof settings.sampling.visibility === 'boolean'
                    ? settings.sampling.visibility
                    : settings.sampling.visibility === 1
                }
                onChange={(e) => handleSamplingChange('visibility', e.target.checked)}
              />
            </FormControl>
            <FormControl display="flex" alignItems="center" mb={3}>
              <FormLabel mb="0">Mouse Move Recording</FormLabel>
              <Switch
                isChecked={!!settings.sampling.mousemove}
                onChange={(e) => handleSamplingChange('mousemove', e.target.checked)}
              />
            </FormControl>

            <Text fontWeight="bold" mt={2} mb={2}>
              Mouse Interaction
            </Text>
            <Stack spacing={2}>
              {Object.entries(settings.sampling.mouseInteraction).map(([key, value]) => (
                <FormControl key={key} display="flex" alignItems="center">
                  <FormLabel mb="0">{key}</FormLabel>
                  <Switch
                    isChecked={value}
                    onChange={(e) =>
                      handleMouseInteractionChange(key as keyof Settings['sampling']['mouseInteraction'], e.target.checked)
                    }
                  />
                </FormControl>
              ))}
            </Stack>

            <FormControl mt={3}>
              <FormLabel>Scroll Interval (ms)</FormLabel>
              <NumberInput
                value={settings.sampling.scroll as number}
                onChange={(_, value) => handleSamplingChange('scroll', value)}
                min={0}
              >
                <NumberInputField />
              </NumberInput>
            </FormControl>

            <FormControl mt={3}>
              <FormLabel>Media Interval (ms)</FormLabel>
              <NumberInput
                value={settings.sampling.media as number}
                onChange={(_, value) => handleSamplingChange('media', value)}
                min={0}
              >
                <NumberInputField />
              </NumberInput>
            </FormControl>

            <FormControl mt={3}>
              <FormLabel>Input Sampling</FormLabel>
              <Select
                value={String(settings.sampling.input)}
                onChange={
                (e) =>
                  handleSamplingChange('input',
                    e.target.value === 'false' ? false : e.target.value
                  )
              }
              >
                <option value="last">Last</option>
                <option value="all">All</option>
                <option value="false">Disabled</option>
              </Select>
            </FormControl>

          </AccordionPanel>
        </AccordionItem>

        <Divider my={4} />

        {/* Mask Input Options */}
        <AccordionItem>
          <AccordionButton>
            <Box flex="1" textAlign="left">
              Mask Input Options
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel pb={4}>
            {Object.entries(settings.maskInputOptions).map(([key, value]) => (
              <FormControl key={key} display="flex" alignItems="center" mb={2}>
                <FormLabel mb="0">{key}</FormLabel>
                <Checkbox
                  isChecked={value}
                  onChange={(e) => handleMaskInputChange(key as keyof Settings['maskInputOptions'], e.target.checked)}
                />
              </FormControl>
            ))}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      <Button mt={6} colorScheme="blue" onClick={() => void saveSettings()} width="100%">
        Save Settings
      </Button>
    </Box>
  );
}
