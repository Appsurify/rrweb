// packages/web-extension/src/pages/Player.tsx
import { useRef, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Replayer from '@appsurify-testmap/rrweb-player';
import {
  Box,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  VStack,
  FormControl,
  FormLabel,
  Input,
  Button,
  useToast,
  Flex,
} from '@chakra-ui/react';
import {
  deleteSessions, downloadSessions,
  getEvents,
  getSession,
  updateSession,
} from "~/utils/storage";
import { apiClient } from '~/utils/apiClient';
import {
  type Session,
  type SessionMetadata,
  type ExtensionSettings,
  EventName,
} from "~/types";
import { defaultExtensionSettings } from '~/utils/settingsDefaults';
import { settingsManager } from '~/utils/settingsManager';
import { injectRrwebPlayerStyleInline } from '~/utils/injectRrwebPlayerStyle';
import Channel from "~/utils/channel";
import Browser from "webextension-polyfill";


const channel = new Channel();

export default function Player() {
  const playerElRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Replayer | null>(null);

  const { sessionId } = useParams();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionName, setSessionName] = useState('');
  const toast = useToast();

  // Local state for metadata
  const [projectName, setProjectName] = useState('');
  const [testSuiteName, setTestSuiteName] = useState('');
  const [testCaseName, setTestCaseName] = useState('');
  const [testRunName, setTestRunName] = useState('');

  // Load extended settings via settingsManager
  const [extensionSettings, setExtensionSettings] = useState<ExtensionSettings>(defaultExtensionSettings);
  useEffect(() => {
    async function loadSettings() {
      try {
        await settingsManager.load();
      } catch (err) {
        console.error('Failed to load extension settings', err);
      }
    }
    void loadSettings();
    const subscription = (settings: ExtensionSettings) => {
      setExtensionSettings(settings);
    };
    settingsManager.subscribe(subscription);
    return () => settingsManager.unsubscribe(subscription);
  }, []);

  // Load session and metadata
  useEffect(() => {
    if (!sessionId) return;
    getSession(sessionId)
      .then((s) => {
        setSession(s);
        setSessionName(s.name);
        const meta = s.metadata || {};
        setProjectName(meta.projectName || '');
        setTestSuiteName(meta.testSuiteName || '');
        setTestCaseName(meta.testCaseName || '');
        setTestRunName(meta.testRunName || '');
      })
      .catch((err) => {
        console.error(err);
      });
  }, [sessionId]);

  // Initialize player with a minimum container height
  useEffect(() => {
    if (!sessionId) return;
    getEvents(sessionId)
      .then((events) => {
        if (!playerElRef.current || playerRef.current) return;
        injectRrwebPlayerStyleInline();

        playerRef.current = new Replayer({
          target: playerElRef.current,
          props: { events, autoPlay: false },
        });
        console.log(playerRef.current);
      })
      .catch((err) => {
        console.error(err);
      });
    return () => {
      playerRef.current?.pause();
      playerRef.current?.$destroy();
    };
  }, [sessionId]);

  // Function to save updated metadata
  const handleSaveMetadata = async () => {
    if (!session) return;
    const updatedMeta: SessionMetadata = {
      projectName,
      testSuiteName,
      testCaseName,
      testRunName,
      team: session.metadata.team, // save the team if available
    };
    const updatedSession = { ...session, metadata: updatedMeta };
    await updateSession(updatedSession);
    setSession(updatedSession);
    toast({
      title: 'Metadata saved',
      description: 'Session metadata has been updated.',
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  };

  // Function to resend the session to the server
  const handleResendSession = async () => {
    if (!session) return;
    if (!extensionSettings || !extensionSettings.apiSettings) {
      toast({
        title: 'Settings missing',
        description: 'API settings are not loaded. Please check your settings.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    try {
      const events = await getEvents(session.id);
      const sendResponse = await apiClient.sendSession(session, events);
      const updatedSession = {
        ...session,
        syncStatus: 'synced' as "pending" | "synced" | "error",
        lastSyncTimestamp: Date.now(),
        serverId: sendResponse.serverId || session.serverId,
      };
      await updateSession(updatedSession);
      setSession(updatedSession);
      toast({
        title: 'Session Resent',
        description: 'The session was successfully resent.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error: unknown) {
      let errorMessage = 'Unknown error occurred';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      const updatedSession = {
        ...session,
        syncStatus: 'error' as "pending" | "synced" | "error",
        syncError: errorMessage,
      };
      await updateSession(updatedSession);
      setSession(updatedSession);
      toast({
        title: 'Resend Failed',
        description: errorMessage,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  return (
    <Box p={4}>
      <Breadcrumb mb={5} fontSize="md">
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Sessions</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbItem isCurrentPage>
          <BreadcrumbLink>{sessionName}</BreadcrumbLink>
        </BreadcrumbItem>
      </Breadcrumb>

      <Box mt={4}>
        <VStack spacing={4} align="stretch">
          {/* Container for the player with a specified minimum height */}
          <Box ref={playerElRef} minH="400px" mb={4} />
          <Box>
            <Flex align="center" mb={2}>
              <FormLabel fontSize="lg" fontWeight="bold" mr={2}>
                Session Metadata
              </FormLabel>
            </Flex>
          </Box>
          <FormControl mb={2}>
            <FormLabel>Project</FormLabel>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Project name"
            />
          </FormControl>
          <FormControl mb={2}>
            <FormLabel>Test Suite</FormLabel>
            <Input
              value={testSuiteName}
              onChange={(e) => setTestSuiteName(e.target.value)}
              placeholder="Test suite name"
            />
          </FormControl>
          <FormControl mb={2}>
            <FormLabel>Testcase Name</FormLabel>
            <Input
              value={testCaseName}
              onChange={(e) => setTestCaseName(e.target.value)}
              placeholder="Testcase name"
            />
          </FormControl>
          <FormControl mb={2}>
            <FormLabel>Testrun Name</FormLabel>
            <Input
              value={testRunName}
              onChange={(e) => setTestRunName(e.target.value)}
              placeholder="Testrun name"
            />
          </FormControl>

          <Flex mt={2} gap={2}>
            {session && session.syncStatus !== 'synced' && (
              <Button size="sm" colorScheme="blue" onClick={() => void handleSaveMetadata()}>
                Save Metadata
              </Button>
            )}
            {session && session.syncStatus !== 'synced' && (
              <Button size="sm" colorScheme="red" onClick={() => void handleResendSession()}>
                Resend Session
              </Button>
            )}
            <Button
                mr={4}
                size="md"
                colorScheme="green"
                onClick={() => {

                  void downloadSessions(
                    [session!.id],
                  );
                }}
              >
                Download
              </Button>
            <Button
                mr={4}
                size="md"
                colorScheme="red"
                onClick={() => {

                  void deleteSessions([session!.id]).then(() => {
                    channel.emit(EventName.SessionUpdated, {});
                    void Browser.tabs.update({ url: '/pages/index.html#/' });
                  });
                }}
              >
                Delete
              </Button>


          </Flex>

        </VStack>
      </Box>
    </Box>
  );
}
