import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Radio,
  RadioGroup,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import { FiRefreshCcw } from 'react-icons/fi';
import { TeamSelector } from '~/components/TeamSelector';
import { apiClient } from '~/utils/apiClient';
import { settingsManager } from '~/utils/settingsManager';
import type {
  ApiSettings,
  AuthType,
  Team,
  ExtensionSettings,
  PersonalTokenAuth, JWTAuth,
} from "~/types";
import { defaultApiSettings } from '~/utils/settingsDefaults';
import { handleError } from "~/utils/errorHandler";


/**
 * API Options component.
 * Uses settingsManager to load and update settings and a single apiClient.
 */
export function ApiOptions() {
  const toast = useToast();

  // Local state for API settings, obtained from the centralized settingsManager
  const [apiSettings, setApiSettings] = useState<ApiSettings>(defaultApiSettings);
  const [loading, setLoading] = useState<boolean>(true);

  // Additional form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');

  // validAuth is determined based on the presence of authentication data and a user object
  const [validAuth, setValidAuth] = useState<boolean>(false);
  const [teams, setTeams] = useState<Team[]>([]);

  // On mount, load settings via settingsManager and subscribe to changes
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
    // Subscribe to settings changes
    const subscription = (settings: ExtensionSettings) => {
      setApiSettings(settings.apiSettings);
      // Determine valid authentication
      if (
        (settings.apiSettings.authType?.type === 'jwt' &&
          settings.apiSettings.authType.jwtAccessToken &&
          settings.apiSettings.user) ||
        (settings.apiSettings.authType?.type === 'personalToken' &&
          settings.apiSettings.authType.token &&
          settings.apiSettings.user)
      ) {
        setValidAuth(true);
      } else {
        setValidAuth(false);
      }
    };
    settingsManager.subscribe(subscription);
    return () => settingsManager.unsubscribe(subscription);
  }, [toast]);

  /**
   * Function to save new API settings via settingsManager.
   */
  const handleSave = useCallback(
    async (newSettings?: ApiSettings) => {
      try {
        await settingsManager.updateApiSettings(newSettings || apiSettings);
        toast({
          title: 'API Settings Saved',
          description: 'Your API settings have been updated.',
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } catch (error: unknown) {
        handleError(error, toast, 'Error saving settings');
      }
    },
    [apiSettings, toast],
  );

  /**
   * Tests the connection: for JWT, either login or update user data;
   * for personal token, verify the token and load the user.
   */
  const handleTestConnection = async () => {
    try {
      let newSettings = { ...apiSettings };

      if (apiSettings.authType?.type === 'jwt') {
        if (!validAuth) {
          if (!email || !password) {
            toast({
              title: 'Missing Credentials',
              description: 'Please enter your email and password.',
              status: 'error',
              duration: 3000,
              isClosable: true,
            });
            return;
          }
          const loginResponse = await apiClient.login(email, password);
          newSettings.authType = {
            type: 'jwt',
            jwtAccessToken: loginResponse.jwtAccessToken,
            jwtRefreshToken: loginResponse.jwtRefreshToken,
          };
          newSettings.user = loginResponse.user;
        } else {
          const userData = await apiClient.fetchUserData();
          newSettings.user = userData;
        }
      } else if (apiSettings.authType?.type === 'personalToken') {
        const updatedSettings = {
          ...apiSettings,
          authType: { type: 'personalToken', token } as PersonalTokenAuth,
        };
        const userData = await apiClient.fetchUserData();
        updatedSettings.user = userData;
        newSettings = updatedSettings;
      }

      setApiSettings(newSettings);
      setValidAuth(true);
      toast({
        title: 'Connection Successful',
        description: `User: ${newSettings.user?.email || ''}`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      const teamsResponse = await apiClient.fetchTeams();
      setTeams(teamsResponse.results);
      await handleSave(newSettings);
    } catch (error: any) {
      // In case of an error, reset authentication data
      setApiSettings((prev) => ({
        ...prev,
        authType:
          prev.authType?.type === 'jwt'
            ? { type: 'jwt', jwtAccessToken: '', jwtRefreshToken: '' }
            : { type: 'personalToken', token: '' },
        user: undefined,
        currentTeam: undefined,
      }));
      setValidAuth(false);
      setTeams([]);
      handleError(error, toast, 'Error testing connection');
    }
  };

  /**
   * Refreshes the team list.
   */
  const handleRefreshTeams = async () => {
    try {
      const teamsResponse = await apiClient.fetchTeams();
      setTeams(teamsResponse.results);
      toast({
        title: 'Teams Updated',
        description: 'The team list has been updated.',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (error: any) {
      handleError(error, toast, 'Error updating teams');
    }
  };

  /**
   * Logs out by resetting authentication data.
   */
  const handleLogout = async () => {
    try {
      await apiClient.logout();
      const newSettings = {
        ...apiSettings,
        authType:
          apiSettings.authType?.type === 'jwt'
            ? { type: 'jwt', jwtAccessToken: '', jwtRefreshToken: '' } as JWTAuth
            : { type: 'personalToken', token: '' } as PersonalTokenAuth,
        user: undefined,
        currentTeam: undefined,
      };
      setApiSettings(newSettings);
      setValidAuth(false);
      setTeams([]);
      await handleSave(newSettings);
      toast({
        title: 'Logged Out',
        description: 'You have successfully logged out.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error: unknown) {
      handleError(error, toast, 'Error logging out');
    }
  };

  /**
   * Handler for changing the authentication method.
   * If the user is not authenticated yet, reset related data.
   */
  const handleAuthMethodChange = (value: AuthType['type']) => {
    if (validAuth) return;
    const newSettings = {
      ...apiSettings,
      authType:
        value === 'jwt'
          ? { type: 'jwt', jwtAccessToken: '', jwtRefreshToken: '' } as JWTAuth
          : { type: 'personalToken', token: '' } as PersonalTokenAuth,
      user: undefined,
      currentTeam: undefined,
    };
    setApiSettings(newSettings);
    setTeams([]);
    setEmail('');
    setPassword('');
    setToken('');
    setValidAuth(false);
  };

  // When validAuth or API settings change, also fetch the team list
  useEffect(() => {
    if (validAuth) {
      void (async () => {
        try {
          const teamsResponse = await apiClient.fetchTeams();
          setTeams(teamsResponse.results);
        } catch (error) {
          console.error('Failed to load teams:', error);
        }
      })();
    }
  }, [validAuth, apiSettings.baseUrl, apiSettings.authType, apiSettings.user]);

  if (loading) {
    return <Text>Loading settings...</Text>;
  }

  return (
    <Box p={4}>
      <Flex justify="space-between" mb={4}>
        <Text fontSize="md" fontWeight="bold">
          API Settings
        </Text>
      </Flex>

      <FormControl mb={4}>
        <FormLabel>Base URL</FormLabel>
        <Input
          value={apiSettings.baseUrl}
          isDisabled={validAuth}
          onChange={(e) =>
            setApiSettings({ ...apiSettings, baseUrl: e.target.value })
          }
          onBlur={() => void handleSave(apiSettings)}
        />
      </FormControl>

      <Divider mb={4} />

      <FormControl mb={4}>
        <FormLabel>Authentication Method</FormLabel>
        <RadioGroup
          value={apiSettings.authType?.type}
          onChange={(value) =>
            handleAuthMethodChange(value as AuthType['type'])
          }
        >
          <Stack direction="row">
            <Radio value="jwt" isDisabled={validAuth}>
              JWT
            </Radio>
            <Radio value="personalToken" isDisabled={validAuth}>
              Personal Token
            </Radio>
          </Stack>
        </RadioGroup>
      </FormControl>

      {apiSettings.authType?.type === 'jwt' ? (
        !validAuth ? (
          <Box mb={4}>
            <FormControl mb={2}>
              <FormLabel>Email</FormLabel>
              <Input
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => void handleSave(apiSettings)}
              />
            </FormControl>
            <FormControl mb={2}>
              <FormLabel>Password</FormLabel>
              <Input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => void handleSave(apiSettings)}
              />
            </FormControl>
            <Button onClick={() => void handleTestConnection()} size="sm" colorScheme="teal">
              Test Connection
            </Button>
          </Box>
        ) : (
          <Flex align="center" justify="space-between" mb={4}>
            <Text fontWeight="bold">
              Logged in as: {apiSettings.user?.email}
            </Text>
            <Button onClick={() => void handleLogout()} size="sm" colorScheme="red">
              Logout
            </Button>
          </Flex>
        )
      ) : !validAuth ? (
        <Box mb={4}>
          <FormControl mb={2}>
            <FormLabel>Personal Token</FormLabel>
            <Input
              placeholder="Enter your personal token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onBlur={() => void handleSave(apiSettings)}
            />
          </FormControl>
          <Button onClick={() => void handleTestConnection()} size="sm" colorScheme="teal">
            Test Connection
          </Button>
        </Box>
      ) : (
        <Flex align="center" justify="space-between" mb={4}>
          <Text fontWeight="bold">
            Logged in as: {apiSettings.user?.email}
          </Text>
          <Button onClick={() => void handleLogout()} size="sm" colorScheme="red">
            Logout
          </Button>
        </Flex>
      )}

      <Divider mb={4} />

      <Box mb={4}>
        <Flex align="center" justify="space-between">
          <Text mb={2} fontWeight="bold">
            Team Settings
          </Text>
          <IconButton
            aria-label="Refresh teams"
            icon={<FiRefreshCcw />}
            size="sm"
            onClick={() => void handleRefreshTeams()}
            disabled={!apiSettings.user}
          />
        </Flex>
        <TeamSelector
          teams={teams}
          currentTeam={apiSettings.currentTeam}
          onChange={(team) => {
            const newSettings = { ...apiSettings, currentTeam: team };
            setApiSettings(newSettings);
            void handleSave(newSettings);
          }}
          disabled={!apiSettings.user}
        />
      </Box>
    </Box>
  );
}
