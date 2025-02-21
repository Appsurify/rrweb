import React, { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  FormControl,
  FormLabel,
  Switch,
  Text,
  Divider,
  useToast,
} from '@chakra-ui/react';
import type { OtherSettings, ExtensionSettings } from '~/types';
import { defaultOtherSettings } from '~/utils/settingsDefaults';
import { settingsManager } from '~/utils/settingsManager';
import { handleError } from "~/utils/errorHandler";

export function OtherOptions() {
  const toast = useToast();
  const [otherSettings, setOtherSettings] = useState<OtherSettings>(
    defaultOtherSettings,
  );
  const [loading, setLoading] = useState<boolean>(true);

  // On mount, load settings through settingsManager and subscribe to its changes
  useEffect(() => {
    async function init() {
      try {
        await settingsManager.load();
      } catch (error) {
        handleError(error, toast, 'Failed to load extension settings');
      } finally {
        setLoading(false);
      }
    }
    void init();

    const subscription = (settings: ExtensionSettings) => {
      setOtherSettings(settings.otherSettings);
    };
    settingsManager.subscribe(subscription);
    return () => {
      settingsManager.unsubscribe(subscription);
    };
  }, []);

  // Function for saving settings through settingsManager
  const handleSave = async (newSettings: OtherSettings) => {
    try {
      await settingsManager.updateOtherSettings(newSettings);
      toast({
        title: 'Settings saved',
        description: 'Other settings have been updated.',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (error: unknown) {
      handleError(error, toast, 'Error saving settings');
    }
  };

  // Handler for toggling debug mode
  const handleDebugModeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    const newSettings: OtherSettings = {
      ...otherSettings,
      enableDebugMode: newValue,
    };
    setOtherSettings(newSettings);
    void handleSave(newSettings);
  };

  if (loading) {
    return <Text>Loading settings...</Text>;
  }

  return (
    <Box p={4}>
      <Flex justify="space-between" mb={4}>
        <Text fontSize="md" fontWeight="bold">
          Other Options
        </Text>
      </Flex>
      <Divider mb={4} />
      <FormControl display="flex" alignItems="center" mb={4}>
        <FormLabel htmlFor="debug-mode" mb="0">
          Enable Debug Mode
        </FormLabel>
        <Switch
          id="debug-mode"
          isChecked={otherSettings.enableDebugMode}
          onChange={handleDebugModeChange}
          disabled={true}
        />
      </FormControl>
      {/* Additional fields for other settings can be added here */}
    </Box>
  );
}
