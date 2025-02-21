import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Divider,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  NumberInput,
  NumberInputField,
  Radio,
  RadioGroup,
  Stack,
  Text,
  useToast,
} from "@chakra-ui/react";
import type { RecordSettings } from '~/types';
import { defaultRecordSettings } from '~/utils/settingsDefaults';
import { settingsManager } from '~/utils/settingsManager';
import { handleError } from '~/utils/errorHandler';

const maskInputOptionKeys: (keyof RecordSettings['maskInputOptions'])[] = [
  'color',
  'date',
  'datetime-local',
  'email',
  'month',
  'number',
  'range',
  'search',
  'tel',
  'text',
  'time',
  'url',
  'week',
  'textarea',
  'select',
  'password',
];

export function RecordOptions() {
  const toast = useToast();
  const [recordSettings, setRecordSettings] =
    useState<RecordSettings>(defaultRecordSettings);
  const [loading, setLoading] = useState<boolean>(true);

  // Load saved record settings via settingsManager
  useEffect(() => {
    async function loadStoredSettings() {
      try {
        await settingsManager.load();
        const settings = settingsManager.getSettings();
        if (settings.recordSettings) {
          setRecordSettings(settings.recordSettings);
        }
      } catch (error) {
        handleError(error, toast, 'Failed to load extension settings');
      } finally {
        setLoading(false);
      }
    }
    void loadStoredSettings();
  }, [toast]);

  // Function to save settings using settingsManager
  const handleSave = async (newSettings: RecordSettings) => {
    try {
      await settingsManager.updateRecordSettings(newSettings);
      toast({
        title: 'Settings saved',
        description: 'Record settings have been updated.',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (error: unknown) {
      handleError(error, toast, 'Error saving settings');
    }
  };

  // Function to reset record settings to default
  const handleReset = () => {
    setRecordSettings(defaultRecordSettings);
    void handleSave(defaultRecordSettings);
    toast({
      title: 'Settings reset',
      description: 'Record settings have been reset to default.',
      status: 'info',
      duration: 3000,
      isClosable: true,
    });
  };

  // Handler for changing checkout type with explicit object literal creation
  const handleCheckoutTypeChange = (
    type: 'checkoutEveryEvc' | 'checkoutEveryNth' | 'checkoutEveryNms',
  ) => {
    const newCheckoutType: RecordSettings['checkoutType'] =
      type === 'checkoutEveryEvc'
        ? { type: 'checkoutEveryEvc', value: true }
        : { type, value: 0 };
    const newSettings: RecordSettings = {
      ...recordSettings,
      checkoutType: newCheckoutType,
    };
    setRecordSettings(newSettings);
    void handleSave(newSettings);
  };

  // Handler for changing the numeric value for checkout (for Nth and Nms)
  const handleCheckoutValueChange = (value: number) => {
    // Assumes that checkoutType already has the type 'checkoutEveryNth' or 'checkoutEveryNms'
    const newCheckoutType = {
      ...recordSettings.checkoutType,
      value,
    } as Extract<RecordSettings['checkoutType'], { value: number }>;
    const newSettings: RecordSettings = {
      ...recordSettings,
      checkoutType: newCheckoutType,
    };
    setRecordSettings(newSettings);
    void handleSave(newSettings);
  };

  // Handler for Sampling Strategy
  const handleSamplingChange = <K extends keyof NonNullable<RecordSettings['sampling']>>(
    field: K,
    value: NonNullable<RecordSettings['sampling']>[K],
  ) => {
    const newSampling = { ...recordSettings.sampling, [field]: value };
    const newSettings: RecordSettings = { ...recordSettings, sampling: newSampling };
    setRecordSettings(newSettings);
    void handleSave(newSettings);
  };

  // Handler for Mask Input Options
  const handleMaskInputOptionChange = (
    option: keyof RecordSettings['maskInputOptions'],
    value: boolean,
  ) => {
    const newMaskOptions = {
      ...recordSettings.maskInputOptions,
      [option]: value,
    };
    const newSettings: RecordSettings = { ...recordSettings, maskInputOptions: newMaskOptions };
    setRecordSettings(newSettings);
    void handleSave(newSettings);
  };

  if (loading) {
    return <Text>Loading record settings...</Text>;
  }

  return (
    <Box p={4}>
      <Flex justify="space-between" mb={4}>
        <Text fontSize="md" fontWeight="bold">
          Record Options
        </Text>
        <Button onClick={handleReset} size="sm" colorScheme="orange">
          Reset to Default
        </Button>
      </Flex>

      {/* Checkout Settings */}
      <Box mb={4}>
        <FormControl mb={2}>
          <FormLabel>Checkout Strategy</FormLabel>
          <RadioGroup
            value={recordSettings.checkoutType.type}
            onChange={(value: string) =>
              handleCheckoutTypeChange(
                value as 'checkoutEveryEvc' | 'checkoutEveryNth' | 'checkoutEveryNms'
              )
            }
          >
            <Stack direction="row">
              <Radio value="checkoutEveryEvc">Every Evc</Radio>
              <Radio value="checkoutEveryNth">Every Nth</Radio>
              <Radio value="checkoutEveryNms">Every Nms</Radio>
            </Stack>
          </RadioGroup>
          <FormHelperText>Every Evc - take a snapshot if any element changes visibility</FormHelperText>
          <FormHelperText>Every Nth - take a snapshot every N actions</FormHelperText>
          <FormHelperText>Every Nms - take a snapshot every N milliseconds</FormHelperText>
        </FormControl>
        {(recordSettings.checkoutType.type === 'checkoutEveryNth' ||
          recordSettings.checkoutType.type === 'checkoutEveryNms') && (
          <FormControl mb={2}>
            <FormLabel>
              {recordSettings.checkoutType.type === 'checkoutEveryNth'
                ? 'Nth Value'
                : 'Nms Value'}
            </FormLabel>
            <NumberInput
              value={recordSettings.checkoutType.value.toString()}
              onChange={(valueString) =>
                handleCheckoutValueChange(Number(valueString))
              }
              min={0}
            >
              <NumberInputField />
            </NumberInput>
          </FormControl>
        )}
      </Box>

      <Divider mb={4} />

      {/* Sampling Strategy */}
      <Box mb={4}>
        <Text fontWeight="bold" mb={2}>
          Sampling Strategy
        </Text>

        {/* Mousemove */}
        <FormControl mb={2}>
          <FormLabel>Record Mousemove</FormLabel>
          <Checkbox
            isChecked={recordSettings.sampling?.mousemove !== false}
            onChange={(e) => {
              const newValue = e.target.checked
                ? typeof recordSettings.sampling?.mousemove === 'number'
                  ? recordSettings.sampling?.mousemove
                  : true
                : false;
              handleSamplingChange('mousemove', newValue);
            }}
          >
            Enable Mousemove Sampling
          </Checkbox>
        </FormControl>
        {recordSettings.sampling?.mousemove !== false && (
          <FormControl mb={2}>
            <FormLabel>Mousemove Throttle (ms)</FormLabel>
            <NumberInput
              value={
                typeof recordSettings.sampling?.mousemove === 'number'
                  ? recordSettings.sampling?.mousemove.toString()
                  : ''
              }
              onChange={(valueString) => {
                const num =
                  valueString.trim() !== '' ? Number(valueString) : true;
                handleSamplingChange('mousemove', num);
              }}
              min={0}
              _placeholder="Optional throttle in ms for mousemove"
            >
              <NumberInputField />
            </NumberInput>
            <FormHelperText>Note: if left blank, no throttle will be applied</FormHelperText>
          </FormControl>
        )}

        {/* Mouse Interaction */}
        <FormControl mb={2}>
          <FormLabel>Record Mouse Interaction</FormLabel>
          <Checkbox
            isChecked={!!recordSettings.sampling?.mouseInteraction}
            onChange={(e) => {
              const newValue = e.target.checked
                ? {
                    MouseUp: false,
                    MouseDown: false,
                    Click: false,
                    ContextMenu: false,
                    DblClick: false,
                    Focus: false,
                    Blur: false,
                    TouchStart: false,
                    TouchEnd: false,
                  }
                : false;
              handleSamplingChange('mouseInteraction', newValue);
            }}
          >
            Enable Mouse Interaction Recording
          </Checkbox>
        </FormControl>
        {recordSettings.sampling?.mouseInteraction &&
          typeof recordSettings.sampling.mouseInteraction === 'object' && (
            <Box ml={4} mb={2}>
              {Object.keys(recordSettings.sampling.mouseInteraction).map(
                (key) => {
                  const value = (
                    recordSettings.sampling!.mouseInteraction as Record<
                      string,
                      boolean
                    >
                  )[key];
                  return (
                    <FormControl mb={1} key={key}>
                      <Checkbox
                        isChecked={value}
                        onChange={(e) => {
                          const newObject = {
                            ...(recordSettings.sampling!
                              .mouseInteraction as Record<string, boolean>),
                            [key]: e.target.checked,
                          };
                          handleSamplingChange('mouseInteraction', newObject);
                        }}
                      >
                        {key}
                      </Checkbox>
                    </FormControl>
                  );
                },
              )}
            </Box>
          )}

        {/* Scroll */}
        <FormControl mb={2}>
          <FormLabel>Scroll (ms)</FormLabel>
          <NumberInput
            value={recordSettings.sampling?.scroll?.toString() || '0'}
            onChange={(valueString) =>
              handleSamplingChange('scroll', Number(valueString))
            }
            min={0}
          >
            <NumberInputField />
          </NumberInput>
        </FormControl>

        {/* Media */}
        <FormControl mb={2}>
          <FormLabel>Media (ms)</FormLabel>
          <NumberInput
            value={recordSettings.sampling?.media?.toString() || '0'}
            onChange={(valueString) =>
              handleSamplingChange('media', Number(valueString))
            }
            min={0}
          >
            <NumberInputField />
          </NumberInput>
        </FormControl>

        {/* Input */}
        <FormControl mb={2}>
          <FormLabel>Input</FormLabel>
          <RadioGroup
            value={recordSettings.sampling?.input || 'last'}
            onChange={(value) => handleSamplingChange('input', value as "all" | "last")}
          >
            <Stack direction="row">
              <Radio value="all">All</Radio>
              <Radio value="last">Last</Radio>
            </Stack>
          </RadioGroup>
        </FormControl>

        {/* Canvas */}
        <FormControl mb={2}>
          <FormLabel>Canvas</FormLabel>
          <RadioGroup
            value={recordSettings.sampling?.canvas?.toString() || 'all'}
            onChange={(value) => {
              if (value === 'all') {
                handleSamplingChange('canvas', 'all');
              } else {
                handleSamplingChange('canvas', Number(value));
              }
            }}
          >
            <Stack direction="row">
              <Radio value="all">All</Radio>
              <Radio value="30">30 fps</Radio>
              <Radio value="60">60 fps</Radio>
            </Stack>
          </RadioGroup>
        </FormControl>

        {/* Visibility */}
        <FormControl mb={2}>
          <FormLabel>Visibility</FormLabel>
          <Checkbox
            isChecked={!!recordSettings.sampling?.visibility}
            onChange={(e) =>
              handleSamplingChange('visibility', e.target.checked)
            }
          >
            Enable Visibility Sampling
          </Checkbox>
        </FormControl>
      </Box>

      <Divider mb={4} />

      {/* Mask Input Options */}
      <Box mb={4}>
        <Text fontWeight="bold" mb={2}>
          Mask Input Options
        </Text>
        {maskInputOptionKeys.map((option) => (
          <FormControl mb={2} key={option}>
            <Checkbox
              isChecked={recordSettings.maskInputOptions?.[option] ?? false}
              onChange={(e) =>
                handleMaskInputOptionChange(option, e.target.checked)
              }
            >
              Mask {option} fields
            </Checkbox>
          </FormControl>
        ))}
      </Box>
    </Box>
  );
}
