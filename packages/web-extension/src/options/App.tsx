import { Route, Routes } from 'react-router-dom';
import SidebarWithHeader from '~/components/SidebarWithHeader';
import { FiList, FiSettings } from 'react-icons/fi';
import { Box } from '@chakra-ui/react';
import { SettingsPage } from './SettingsPage';


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
      sideBarItems={[]}
    >
      <Box p="10">
        <Routes>
          <Route path="/" element={<SettingsPage />} />
        </Routes>
      </Box>
    </SidebarWithHeader>
  );
}
