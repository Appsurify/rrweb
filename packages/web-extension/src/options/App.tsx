import { Route, Routes, Navigate } from 'react-router-dom';
import SidebarWithHeader from '~/components/SidebarWithHeader';
import { FiCamera, FiList, FiServer, FiSettings, FiTool } from 'react-icons/fi';
import { Box } from '@chakra-ui/react';
import { RecordOptions } from '~/options/RecordOptions';
import { ApiOptions } from '~/options/ApiOptions';
import { OtherOptions } from '~/options/OtherOptions';

export default function App() {
  return (
    <SidebarWithHeader
      title="Settings"
      headBarItems={[
        {
          label: 'Settings',
          icon: FiSettings,
          href: '#',
        },
        {
          label: 'Sessions',
          icon: FiList,
          href: '/pages/index.html#',
        },
      ]}
      sideBarItems={[
        {
          label: 'API',
          icon: FiServer,
          href: `#/api`,
        },
        {
          label: 'Recording',
          icon: FiCamera,
          href: `#/record`,
        },
        {
          label: 'Other',
          icon: FiTool,
          href: '#/other',
        },
      ]}
    >
      <Box p="10">
        <Routes>
          <Route index element={<Navigate to="/api" replace />} />
          <Route path="/api" element={<ApiOptions />} />
          <Route path="/record" element={<RecordOptions />} />
          <Route path="/other" element={<OtherOptions />} />
          <Route path="*" element={<Navigate to="/api" replace />} />
        </Routes>
      </Box>
    </SidebarWithHeader>
  );
}
