// packages/web-extension/src/popup/PopupRecorder.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import Browser from 'webextension-polyfill';
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Link,
  Select,
  Spacer,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import {
  FiSettings,
  FiList,
  FiPause,
  FiPlay,
} from 'react-icons/fi';
import { FaLightbulb } from 'react-icons/fa';
import Channel from '~/utils/channel';
import { LocalDataKey, RecorderStatus, EventName } from '~/types';
import type {
  LocalData,
  Session,
  ExtensionSettings,
  Project,
  TestSuite,
} from '~/types';
import { CircleButton } from '~/components/CircleButton';
import { Timer } from './Timer';
import { apiClient } from '~/utils/apiClient';
import { settingsManager } from '~/utils/settingsManager';

const RECORD_BUTTON_SIZE = 3;
const channel = new Channel();

interface SessionMetadataStored {
  selectedProjectId?: number;
  selectedTestSuiteId?: number;
  testcaseName?: string;
  testrunName?: string;
}

function generateDefaultTestRunName(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `TR ${year}-${month}-${day}`;
}

export function App() {
  const toast = useToast();

  // Recording status, error messages, and timer
  const [status, setStatus] = useState<RecorderStatus>(RecorderStatus.IDLE);
  const [errorMessage, setErrorMessage] = useState('');
  const [startTime, setStartTime] = useState(0);
  const [newSession, setNewSession] = useState<Session | null>(null);

  // Extension settings
  const [extensionSettings, setExtensionSettings] = useState<ExtensionSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Session metadata (form) — state is still used for component management,
  // but the latest values will be read via refs.
  const [projects, setProjects] = useState<Project[]>([]);
  const [testSuites, setTestSuites] = useState<TestSuite[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedTestSuite, setSelectedTestSuite] = useState<TestSuite | null>(null);
  const [testcaseName, setTestcaseName] = useState('');
  const [testrunName, setTestrunName] = useState(generateDefaultTestRunName());

  const toastDuration = 3000;

  // Refs for all form fields
  const projectRef = useRef<HTMLSelectElement>(null);
  const testSuiteRef = useRef<HTMLSelectElement>(null);
  const testcaseNameRef = useRef<HTMLInputElement>(null);
  const testrunNameRef = useRef<HTMLInputElement>(null);

  // Function to update metadata in local storage
  const updateLocalMetadata = async (meta: SessionMetadataStored) => {
    try {
      await Browser.storage.local.set({ sessionMetadata: meta });
    } catch (e) {
      console.error('Failed to update session metadata', e);
    }
  };

  // Load settings via settingsManager
  useEffect(() => {
    async function loadSettings() {
      try {
        await settingsManager.load();
      } catch (e) {
        console.error('Failed to load extension settings:', e);
      } finally {
        setLoadingSettings(false);
      }
    }
    void loadSettings();
    const subscription = (settings: ExtensionSettings) => {
      setExtensionSettings(settings);
    };
    settingsManager.subscribe(subscription);
    return () => settingsManager.unsubscribe(subscription);
  }, []);

  // On mount: load metadata or initialize an empty object
  useEffect(() => {
    async function initMetadata() {
      try {
        const stored = await Browser.storage.local.get('sessionMetadata');
        if (stored.sessionMetadata) {
          const meta = stored.sessionMetadata as SessionMetadataStored;
          if (meta.testcaseName) setTestcaseName(meta.testcaseName);
          if (meta.testrunName) setTestrunName(meta.testrunName);
          if (meta.selectedProjectId) {
            setSelectedProject({ id: meta.selectedProjectId } as Project);
          }
          if (meta.selectedTestSuiteId) {
            setSelectedTestSuite({ id: meta.selectedTestSuiteId } as TestSuite);
          }
        } else {
          // If no object exists, create one with the current values
          const initialMeta: SessionMetadataStored = {
            testcaseName: '',
            testrunName: generateDefaultTestRunName(),
          };
          await updateLocalMetadata(initialMeta);
        }
      } catch (e) {
        console.error('Failed to load or initialize session metadata', e);
      }
    }
    void initMetadata();
  }, []);

  // On each field change, update both state and local storage immediately
  const handleTestcaseNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTestcaseName(value);
    void updateLocalMetadata({
      selectedProjectId: selectedProject ? selectedProject.id : undefined,
      selectedTestSuiteId: selectedTestSuite ? selectedTestSuite.id : undefined,
      testcaseName: value,
      testrunName,
    });
  };

  const handleTestrunNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTestrunName(value);
    void updateLocalMetadata({
      selectedProjectId: selectedProject ? selectedProject.id : undefined,
      selectedTestSuiteId: selectedTestSuite ? selectedTestSuite.id : undefined,
      testcaseName,
      testrunName: value,
    });
  };

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const proj = projects.find(p => p.id === Number(e.target.value)) || null;
    setSelectedProject(proj);
    // Reset the test suite when the project changes
    setSelectedTestSuite(null);
    void updateLocalMetadata({
      selectedProjectId: proj ? proj.id : undefined,
      selectedTestSuiteId: undefined,
      testcaseName,
      testrunName,
    });
  };

  const handleTestSuiteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const ts = testSuites.find(t => t.id === Number(e.target.value)) || null;
    setSelectedTestSuite(ts);
    void updateLocalMetadata({
      selectedProjectId: selectedProject ? selectedProject.id : undefined,
      selectedTestSuiteId: ts ? ts.id : undefined,
      testcaseName,
      testrunName,
    });
  };

  // Authorization check (updating user via apiClient)
  const validateAuthorization = useCallback(async () => {
    const currentApiSettings = settingsManager.getSettings().apiSettings;
    if (currentApiSettings && currentApiSettings.user) {
      try {
        await apiClient.fetchUserData();
      } catch (error) {
        toast({
          title: 'Authorization expired',
          description: 'Your session has expired. Please log in via Options.',
          status: 'error',
          duration: toastDuration,
          isClosable: true,
        });
      }
    }
  }, [toast]);

  useEffect(() => {
    void validateAuthorization();
  }, [validateAuthorization]);

  useEffect(() => {
    const interval = setInterval(() => {
      void validateAuthorization();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [validateAuthorization]);

  // Handling recording status and updating session via local storage and channel
  useEffect(() => {
    const parseStatusData = (data: LocalData[LocalDataKey.recorderStatus]) => {
      const { status, startTimestamp, pausedTimestamp } = data;
      setStatus(status);
      if (startTimestamp && pausedTimestamp) {
        setStartTime(Date.now() - pausedTimestamp + startTimestamp);
      } else if (startTimestamp) {
        setStartTime(startTimestamp);
      }
    };

    void Browser.storage.local.get(LocalDataKey.recorderStatus).then((data) => {
      if (!data || !data[LocalDataKey.recorderStatus]) return;
      parseStatusData((data as LocalData)[LocalDataKey.recorderStatus]);
    });

    Browser.storage.local.onChanged.addListener((changes) => {
      if (!changes[LocalDataKey.recorderStatus]) return;
      const data = changes[LocalDataKey.recorderStatus].newValue as LocalData[LocalDataKey.recorderStatus];
      parseStatusData(data);
      if (data.errorMessage) setErrorMessage(data.errorMessage);
    });

    channel.on(EventName.SessionUpdated, (data) => {
      setNewSession((data as { session: Session }).session);
    });
  }, []);

  // Loading projects from the API server
  useEffect(() => {
    async function loadProjects() {
      if (
        extensionSettings &&
        extensionSettings.apiSettings.user &&
        extensionSettings.apiSettings.currentTeam
      ) {
        try {
          const response = await apiClient.fetchProjects();
          setProjects(response.results);
        } catch (e) {
          console.error('Failed to load projects', e);
        }
      }
    }
    void loadProjects();
  }, [extensionSettings]);

  // Loading test suites for the selected project
  useEffect(() => {
    async function loadTestSuites() {
      if (extensionSettings && selectedProject) {
        try {
          const response = await apiClient.fetchTestSuites(selectedProject.id);
          setTestSuites(response.results);
        } catch (e) {
          console.error('Failed to load test suites', e);
        }
      }
    }
    void loadTestSuites();
  }, [extensionSettings, selectedProject]);

  // Restoring the selected project from metadata
  useEffect(() => {
    async function restoreProject() {
      const stored = (await Browser.storage.local.get('sessionMetadata')) as { sessionMetadata?: SessionMetadataStored };
      if (stored.sessionMetadata?.selectedProjectId && projects.length) {
        const proj = projects.find(p => p.id === stored.sessionMetadata!.selectedProjectId);
        if (proj) setSelectedProject(proj);
      }
    }
    void restoreProject();
  }, [projects]);

  // Restoring the selected test suite from metadata
  useEffect(() => {
    async function restoreTestSuite() {
      const stored = (await Browser.storage.local.get('sessionMetadata')) as { sessionMetadata?: SessionMetadataStored };
      if (stored.sessionMetadata?.selectedTestSuiteId && testSuites.length) {
        const ts = testSuites.find(t => t.id === stored.sessionMetadata!.selectedTestSuiteId);
        if (ts) setSelectedTestSuite(ts);
      }
    }
    void restoreTestSuite();
  }, [testSuites]);

  // Function to clear the metadata form
  const handleClearForm = () => {
    setSelectedProject(null);
    setSelectedTestSuite(null);
    setTestcaseName('');
    const defaultTR = generateDefaultTestRunName();
    setTestrunName(defaultTR);
    void updateLocalMetadata({
      testcaseName: '',
      testrunName: defaultTR,
    });
  };

  if (loadingSettings) {
    return <Text>Loading settings...</Text>;
  }

  return (
    <Flex direction="column" w={400} padding="5%" height="auto">
      <Flex align="center" mb={4}>
        <Text fontSize="md" fontWeight="bold">
          Testmap RRWeb Recorder
        </Text>
        <Spacer />

        <Stack direction="row">
          <IconButton
            onClick={ () => {
                const specificOptionsPageUrl = Browser.runtime.getURL('options/index.html#/api');
                void Browser.tabs.create({ url: specificOptionsPageUrl });
              }
            }
            size="xs"
            color={
              extensionSettings &&
              extensionSettings.apiSettings.user &&
              extensionSettings.apiSettings.currentTeam
                ? 'green'
                : 'red'
            }
            icon={<FaLightbulb />}
            aria-label="Authentication"
            title="Authentication"
          />
          <IconButton
            onClick={ () => {
                const specificOptionsPageUrl = Browser.runtime.getURL('options/index.html#/record');
                void Browser.tabs.create({ url: specificOptionsPageUrl });
              }
            }
            size="xs"
            icon={<FiSettings />}
            aria-label="Recording settings"
            title="Recording settings"
          />
          <IconButton
            onClick={() => void Browser.tabs.create({ url: '/pages/index.html#/' })}
            size="xs"
            icon={<FiList />}
            aria-label="Session List"
            title="Session List"
          />
        </Stack>
      </Flex>

      {/* Authorization Information */}
      {extensionSettings?.apiSettings.user &&
        extensionSettings.apiSettings.currentTeam && (
          <Box mb={4}>
            <Text fontSize="sm">
              Logged in: <strong>{extensionSettings.apiSettings.user.email}</strong>
            </Text>
            <Text fontSize="sm">
              Team: <strong>{extensionSettings.apiSettings.currentTeam.name}</strong>
            </Text>
          </Box>
      )}

      {status !== RecorderStatus.IDLE && startTime && (
        <Timer startTime={startTime} ticking={status === RecorderStatus.RECORDING} />
      )}

      {/* Recording controls */}
      <Flex justify="center" gap="10" mt="5" mb="5">
        <CircleButton
          diameter={RECORD_BUTTON_SIZE}
          title={
            status === RecorderStatus.IDLE
              ? 'Start Recording'
              : 'Stop Recording'
          }
          onClick={() => {
            // Remove focus from the active element to ensure that all changes are applied
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
            // Read the current values directly from the DOM via refs
            const actualProjectId = projectRef.current?.value;
            const actualTestSuiteId = testSuiteRef.current?.value;
            const actualTestcaseName = testcaseNameRef.current?.value || '';
            const actualTestrunName = testrunNameRef.current?.value || '';

            if (status === RecorderStatus.IDLE) {
              // If authorized, check that all fields are filled
              if (extensionSettings?.apiSettings.user) {
                if (
                  !actualProjectId ||
                  !actualTestSuiteId ||
                  actualTestcaseName.trim() === '' ||
                  actualTestrunName.trim() === ''
                ) {
                  toast({
                    title: 'Incomplete Metadata',
                    description: 'Please fill in all required metadata fields before starting recording.',
                    status: 'warning',
                    duration: toastDuration,
                    isClosable: true,
                  });
                  return;
                }
              }
              // For select fields, retrieve the selected objects from the projects/test suites array
              const selectedProjectObj = projects.find(p => p.id.toString() === actualProjectId);
              const selectedTestSuiteObj = testSuites.find(t => t.id.toString() === actualTestSuiteId);
              const metadata = extensionSettings?.apiSettings.user
                ? {
                    projectName: selectedProjectObj?.name,
                    testSuiteName: selectedTestSuiteObj?.name,
                    testCaseName: actualTestcaseName,
                    testRunName: actualTestrunName,
                    team: extensionSettings?.apiSettings.currentTeam,
                  }
                : {};
              void channel.emit(EventName.StartButtonClicked, { metadata });
            } else {
              // When stopping recording, similarly form metadata
              const selectedProjectObj = projects.find(p => p.id.toString() === actualProjectId);
              const selectedTestSuiteObj = testSuites.find(t => t.id.toString() === actualTestSuiteId);
              const metadata = extensionSettings?.apiSettings.user
                ? {
                    projectName: selectedProjectObj?.name,
                    testSuiteName: selectedTestSuiteObj?.name,
                    testCaseName: actualTestcaseName,
                    testRunName: actualTestrunName,
                    team: extensionSettings?.apiSettings.currentTeam,
                  }
                : {};
              void channel.emit(EventName.StopButtonClicked, { metadata });
              // Optionally: clear the form after stopping recording
              handleClearForm();
            }
          }}
        >
          <Box
            w={`${RECORD_BUTTON_SIZE}rem`}
            h={`${RECORD_BUTTON_SIZE}rem`}
            borderRadius={status === RecorderStatus.IDLE ? 9999 : 6}
            margin="0"
            bgColor="red.500"
          />
        </CircleButton>

        {status !== RecorderStatus.IDLE && (
          <CircleButton
            diameter={RECORD_BUTTON_SIZE}
            title={
              status === RecorderStatus.RECORDING
                ? 'Pause Recording'
                : 'Resume Recording'
            }
            onClick={() => {
              if (status === RecorderStatus.RECORDING) {
                void channel.emit(EventName.PauseButtonClicked, {});
              } else {
                void channel.emit(EventName.ResumeButtonClicked, {});
              }
            }}
          >
            <Box
              w={`${RECORD_BUTTON_SIZE}rem`}
              h={`${RECORD_BUTTON_SIZE}rem`}
              borderRadius={9999}
              margin="0"
              color="gray.600"
            >
              {([RecorderStatus.PAUSED, RecorderStatus.PausedSwitch].includes(status)) && (
                <FiPlay style={{ paddingLeft: '0.5rem', width: '100%', height: '100%' }} />
              )}
              {status === RecorderStatus.RECORDING && (
                <FiPause style={{ width: '100%', height: '100%' }} />
              )}
            </Box>
          </CircleButton>
        )}
      </Flex>

      {/* Metadata form available only when authorized */}
      {extensionSettings?.apiSettings.user ? (
        <Box mb={4}>
          <Text mb={2} fontWeight="bold">
            Session Metadata
          </Text>
          <FormControl mb={2}>
            <FormLabel>Project</FormLabel>
            <Select
              placeholder="Select a project"
              value={selectedProject ? selectedProject.id.toString() : ''}
              onChange={handleProjectChange}
              isDisabled={status !== RecorderStatus.IDLE}
              ref={projectRef}
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormControl mb={2}>
            <FormLabel>Test Suite</FormLabel>
            <Select
              placeholder="Select a test suite"
              value={selectedTestSuite ? selectedTestSuite.id.toString() : ''}
              onChange={handleTestSuiteChange}
              isDisabled={!selectedProject || status !== RecorderStatus.IDLE}
              ref={testSuiteRef}
            >
              {testSuites.map(ts => (
                <option key={ts.id} value={ts.id}>
                  {ts.name}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormControl mb={2}>
            <FormLabel>Testcase Name</FormLabel>
            <Input
              placeholder="Enter testcase name"
              value={testcaseName}
              onChange={handleTestcaseNameChange}
              isDisabled={status !== RecorderStatus.IDLE}
              ref={testcaseNameRef}
            />
          </FormControl>
          <FormControl mb={2}>
            <FormLabel>Testrun Name</FormLabel>
            <Input
              placeholder="Enter testrun name"
              value={testrunName}
              onChange={handleTestrunNameChange}
              isDisabled={status !== RecorderStatus.IDLE}
              ref={testrunNameRef}
            />
          </FormControl>
          <Flex justify="flex-end">
            <Button
              size="sm"
              colorScheme="gray"
              onClick={handleClearForm}
              isDisabled={status !== RecorderStatus.IDLE}
            >
              Clear Form
            </Button>
          </Flex>
        </Box>
      ) : (
        <Box mb={4}>
          <Text color="red.500" mb={2}>
            Not Authorized. Please log in via Options.
          </Text>
          <Button
            size="sm"
            onClick={() => {
              const specificOptionsPageUrl = Browser.runtime.getURL('options/index.html#/api');
              void Browser.tabs.create({ url: specificOptionsPageUrl });
            }}
          >
            Sign In
          </Button>
        </Box>
      )}

      {newSession && (
        <Text>
          <Text as="b">New Session: </Text>
          <Link
            href={Browser.runtime.getURL(`pages/index.html#/session/${newSession.id}`)}
            isExternal
          >
            {newSession.name}
          </Link>
        </Text>
      )}

      {errorMessage && (
        <Text color="red.500" fontSize="md">
          {errorMessage}
          <br />
          Maybe refresh your current tab.
        </Text>
      )}
    </Flex>
  );
}
