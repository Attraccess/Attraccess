import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@heroui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@heroui/styles/css';
import '../../src/styles.css';
import { ConfigurationEditor } from '../../src/ConfigurationEditor';

const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <QueryClientProvider client={client}>
      <h1>Fixture-only controller configuration</h1>
      <Button onPress={() => setOpen(true)}>Configure</Button>
      <ConfigurationEditor controllerId={open ? 91058 : null} onOpenChange={setOpen} />
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
