import { useEffect, useState } from 'react';
import {
  AccordionItem,
  AccordionButton,
  Box,
  AccordionIcon,
  AccordionPanel,
  FormControl,
  FormLabel,
  Input,
  Select,
  Button,
  useToast,
} from "@chakra-ui/react";
import Browser from 'webextension-polyfill';
import { SyncDataKey, type ApiSettings, type ExtensionSettings, type AuthMethod } from '~/types';
import { login, logout } from '~/utils/auth';

export function ApiSettings({ settings, onChange }: { settings: ApiSettings; onChange: (newSettings: ApiSettings) => void }) {
  const [localSettings, setLocalSettings] = useState<ApiSettings>(settings);
  const [loading, setLoading] = useState(false);
  const [validatingKey, setValidatingKey] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const toast = useToast();

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleAuthMethodChange = async (method: AuthMethod) => {
    const updatedSettings = {
      ...localSettings,
      authMethod: method,
      apiKey: method === 'apiKey' ? localSettings.apiKey : '',
      jwtAccessToken: method === 'jwt' ? localSettings.jwtAccessToken : '',
      jwtRefreshToken: method === 'jwt' ? localSettings.jwtRefreshToken : '',
      user: undefined,
    };
    await handleSaveSettings(updatedSettings);
  };

  const handleSaveSettings = async (updatedSettings: Partial<ApiSettings>) => {
    try {
      const storedData = await Browser.storage.sync.get(SyncDataKey.extensionSettings) as { extensionSettings?: ExtensionSettings };
      const newSettings: ExtensionSettings = {
        ...storedData.extensionSettings,
        apiSettings: { ...localSettings, ...updatedSettings },
      } as ExtensionSettings;

      await Browser.storage.sync.set({ [SyncDataKey.extensionSettings]: newSettings });
      onChange(newSettings.apiSettings);
      setLocalSettings(newSettings.apiSettings);

      toast({ title: 'Settings saved', status: 'success', duration: 3000, isClosable: true });
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast({ title: 'Error', description: 'Failed to save settings.', status: 'error', duration: 3000, isClosable: true });
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      const success = await login(email, password);
      if (success) {
        const storedData = await Browser.storage.sync.get(SyncDataKey.extensionSettings) as { extensionSettings?: ExtensionSettings };
        const updatedSettings = storedData.extensionSettings?.apiSettings;
        if (updatedSettings) {
          await handleSaveSettings(updatedSettings);
        }
      } else {
        toast({ title: 'Login Failed', description: 'Invalid credentials.', status: 'error', duration: 3000, isClosable: true });
      }
    } catch (error) {
      console.error('Login error:', error);
      toast({ title: 'Error', description: 'Login request failed.', status: 'error', duration: 3000, isClosable: true });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await handleSaveSettings({
      jwtAccessToken: '',
      jwtRefreshToken: '',
      user: undefined,
    });
    await logout();
  };

  const validateApiKey = async () => {
    setValidatingKey(true);
    try {
      const response = await fetch('https://api.testmap.appsurify.com/api/teams', {
        headers: { Authorization: `Api-Key ${localSettings.apiKey ?? ''}` },
      });

      if (response.ok) {
        await handleSaveSettings({ apiKey: localSettings.apiKey });
        toast({ title: 'API Key is valid', status: 'success', duration: 3000, isClosable: true });
      } else {
        throw new Error('Invalid API Key');
      }
    } catch {
      toast({ title: 'Invalid API Key', status: 'error', duration: 3000, isClosable: true });
    } finally {
      setValidatingKey(false);
    }
  };

  return (
    <AccordionItem>
      <AccordionButton>
        <Box flex="1" textAlign="left">🌍 API Settings</Box>
        <AccordionIcon />
      </AccordionButton>
      <AccordionPanel pb={4}>
        <FormControl>
          <FormLabel>Authentication Method</FormLabel>
          <Select
            value={localSettings.authMethod}
            onChange={(e) => void handleAuthMethodChange(e.target.value as AuthMethod)}
          >
            <option value="apiKey">API Key</option>
            <option value="jwt">JWT (Login)</option>
          </Select>
        </FormControl>

        {localSettings.authMethod === 'apiKey' && (
          <>
            <FormControl mt={3}>
              <FormLabel>API Key</FormLabel>
              <Input
                type="text"
                value={localSettings.apiKey || ''}
                onChange={(e) => setLocalSettings((prev) => ({ ...prev, apiKey: e.target.value }))}
              />
            </FormControl>
            <Button mt={3} onClick={() => void validateApiKey} isLoading={validatingKey}>Validate API Key</Button>
          </>
        )}

        {localSettings.authMethod === 'jwt' && !localSettings.jwtAccessToken && (
          <>
            <FormControl mt={3}>
              <FormLabel>Email</FormLabel>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormControl>
            <FormControl mt={3}>
              <FormLabel>Password</FormLabel>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </FormControl>
            <Button mt={3} colorScheme="blue" onClick={() => void handleLogin} isLoading={loading}>Login</Button>
          </>
        )}

        {localSettings.jwtAccessToken && (
          <>
            <FormLabel mt={3}>Logged in as: {localSettings.user?.email}</FormLabel>
            <Button mt={3} colorScheme="red" onClick={() => void handleLogout}>Log Out</Button>
          </>
        )}
      </AccordionPanel>
    </AccordionItem>
  );
}
