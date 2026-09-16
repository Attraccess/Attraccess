import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@heroui/styles/css';
import '../../src/styles.css';
import { ControllersPage } from '../../src/ControllersPage';
import { ConfigurationPage } from '../../src/ConfigurationPage';

const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const root = document.getElementById('root');
if (!root) throw new Error('Missing commissioning fixture mount');
createRoot(root).render(
  <QueryClientProvider client={client}>
    {/* The production host mounts plugin pages inside its router; the fixture
        supplies the same context and paths so page navigation resolves. */}
    <MemoryRouter initialEntries={['/wago']}>
      <Routes>
        <Route path="/wago" element={<ControllersPage />} />
        <Route path="/wago/controllers/:controllerId/configuration" element={<ConfigurationPage />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);
