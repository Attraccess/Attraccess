import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ControllersTable } from './ControllersTable';
import type { CommissioningSession, CommissioningVerification, WagoController } from './api';

const getVerification = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ getCommissioningVerification: getVerification }));
let client: QueryClient;
const session = { id: 7, hardwareId: 'fixture', state: 'awaiting_verification' } as CommissioningSession;
const controller = {
  id: 1,
  hardwareId: 'fixture',
  name: 'Fixture',
  trustState: 'claimed',
  connectivity: 'online',
} as WagoController;
const verified: CommissioningVerification = {
  controllerId: 1,
  permanentConnection: true,
  enrollmentRevoked: true,
  configurationApplied: true,
  hardwareReadiness: 'ready',
  managementHardening: 'unverified',
  softwareReady: false,
  physicalQualification: 'required',
  ready: false,
};
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  getVerification.mockResolvedValue(verified);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.clearAllMocks();
});

function mount(onResume = vi.fn(), onConfigure = vi.fn()) {
  return render(
    <QueryClientProvider client={client}>
      <ControllersTable
        controllers={[controller]}
        sessions={[session]}
        onResume={onResume}
        onConfigure={onConfigure}
        onClaim={vi.fn()}
        onRemove={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

it('shows completed enrollment while keeping verification/recovery and configuration reachable', async () => {
  const onResume = vi.fn();
  const onConfigure = vi.fn();
  mount(onResume, onConfigure);
  expect(await screen.findByText('Enrollment complete · runtime verified')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'View progress' }));
  expect(onResume).toHaveBeenCalledWith(session);
  fireEvent.click(screen.getByRole('button', { name: 'Configure' }));
  expect(onConfigure).toHaveBeenCalledWith(1);
});

it('does not infer enrollment verification from an online claimed row', async () => {
  getVerification.mockResolvedValue({ ...verified, enrollmentRevoked: false });
  mount();
  expect(await screen.findByText('Verification required')).toBeTruthy();
  expect(screen.queryByText(/Enrollment complete/)).toBeNull();
});

it('keeps configuration pending separate from verified enrollment', async () => {
  getVerification.mockResolvedValue({ ...verified, configurationApplied: false, hardwareReadiness: 'not_ready' });
  mount();
  expect(await screen.findByText('Enrollment complete · runtime setup pending')).toBeTruthy();
});

it('withdraws cached success when verification polling fails', async () => {
  mount();
  await screen.findByText('Enrollment complete · runtime verified');
  getVerification.mockRejectedValue(new Error('offline'));
  await client.invalidateQueries({ queryKey: ['wago', 'commissioning-verification', 7] });
  expect(await screen.findByText('Verification status unavailable')).toBeTruthy();
  expect(screen.queryByText(/Enrollment complete/)).toBeNull();
});
