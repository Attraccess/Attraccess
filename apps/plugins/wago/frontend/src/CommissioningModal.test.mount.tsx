import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { CommissioningModal } from './CommissioningModal';
import { client, activeSession } from './CommissioningModal.test.client';
export function mount() {
  const onOpenChange = vi.fn();
  const view = (isOpen: boolean) => (
    <QueryClientProvider client={client}>
      <CommissioningModal isOpen={isOpen} session={activeSession} onOpenChange={onOpenChange} />
    </QueryClientProvider>
  );
  return { ...render(view(true)), view, onOpenChange };
}
