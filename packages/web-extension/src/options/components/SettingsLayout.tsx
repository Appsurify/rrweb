import { Box, Text, Accordion } from '@chakra-ui/react';

export function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box p={6} maxW="800px" mx="auto">
      <Text fontSize="2xl" fontWeight="bold" mb={4}>
        Extension Settings
      </Text>
      <Accordion allowMultiple>{children}</Accordion>
    </Box>
  );
}
