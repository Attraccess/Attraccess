import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@heroui/styles/css';
import '../../src/styles.css';
import { ControllersPage } from '../../src/ControllersPage';

const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const root = document.getElementById('root');
if (!root) throw new Error('Missing commissioning fixture mount');
createRoot(root).render(
  <QueryClientProvider client={client}>
    <ControllersPage />
  </QueryClientProvider>,
);
