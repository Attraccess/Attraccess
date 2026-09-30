import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ControllersTable } from './ControllersTable';
import type { CommissioningSession, CommissioningVerification, WagoController } from './api';

const getVerification = vi.hoisted(() => vi.fn());
const getUpdateStatus = vi.hoisted(() => vi.fn());
const getRootPassword = vi.hoisted(() => vi.fn());
const getSessionStatus = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({
  getCommissioningVerification: getVerification,
  getRuntimeUpdateStatus: getUpdateStatus,
  getRootRecoveryPassword: getRootPassword,
  getManagedAccessStatus: getSessionStatus,
  retryManagedAccess: vi.fn(),
  restoreManagedAccess: vi.fn(),
}));
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
  getUpdateStatus.mockResolvedValue({
    management: 'reenrol_required',
    sessionId: null,
    update: null,
    physicalQualification: 'unverified',
  });
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

it('hides "View progress" once enrollment is verified, keeping configuration and runtime info reachable', async () => {
  const onResume = vi.fn();
  const onConfigure = vi.fn();
  mount(onResume, onConfigure);
  expect(await screen.findByText('Enrollment complete · runtime verified')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'View progress' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Configure' }));
  expect(onConfigure).toHaveBeenCalledWith(1);
  expect(onResume).not.toHaveBeenCalled();
});

it('explains the destructive re-enrolment required for legacy controllers', async () => {
  mount();
  await screen.findByText('Enrollment complete · runtime verified');
  fireEvent.click(screen.getByRole('button', { name: 'Runtime updates' }));
  expect(await screen.findByText('Re-enrolment required')).toBeTruthy();
  expect(screen.getByText(/wipes applications, data and configuration/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Understood' }));
  expect(screen.queryByText('Re-enrolment required')).toBeNull();
});

it('shows durable update failure and requests recovery secrets only on the explicit audited action', async () => {
  getUpdateStatus.mockResolvedValue({
    management: 'managed',
    sessionId: 7,
    update: { phase: 'failed', desiredImageId: 'sha256:desired', failure: 'readiness', retryAt: 0 },
    physicalQualification: 'unverified',
  });
  getRootPassword.mockResolvedValue({ password: 'fixture-recovery-secret' });
  mount();
  await screen.findByText('Enrollment complete · runtime verified');
  fireEvent.click(screen.getByRole('button', { name: 'Runtime updates' }));
  expect(await screen.findByText(/Last failure: readiness/)).toBeTruthy();
  expect(getRootPassword).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Administrator recovery' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reveal root password (audited)' }));
  expect(await screen.findByText('fixture-recovery-secret')).toBeTruthy();
  expect(getRootPassword).toHaveBeenCalledWith(7);
  fireEvent.click(screen.getByRole('button', { name: 'Hide recovery password' }));
  expect(screen.queryByText('fixture-recovery-secret')).toBeNull();
});

it('does not infer enrollment verification from an online claimed row', async () => {
  getVerification.mockResolvedValue({ ...verified, enrollmentRevoked: false });
  mount();
  expect(await screen.findByText('Verification required')).toBeTruthy();
  expect(screen.queryByText(/Enrollment complete/)).toBeNull();
});

it('keeps administrator recovery available for a removed controller session', async () => {
  getSessionStatus.mockResolvedValue({
    management: 'retired',
    sessionId: 7,
    update: null,
    physicalQualification: 'unverified',
  });
  render(
    <QueryClientProvider client={client}>
      <ControllersTable
        controllers={[]}
        sessions={[{ ...session, state: 'revoked', managedAccessAvailable: true }]}
        onResume={vi.fn()}
        onConfigure={vi.fn()}
        onClaim={vi.fn()}
        onRemove={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText('Recovery available')).toBeTruthy();
  expect(screen.queryByText('Enrolling')).toBeNull();
  expect(screen.queryByText('In progress')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Managed SSH recovery' }));
  expect(await screen.findByText('Automatic management retired')).toBeTruthy();
  expect(getSessionStatus).toHaveBeenCalledWith(7);
  expect(getRootPassword).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Administrator recovery' }));
  expect(screen.getByRole('button', { name: 'Reveal root password (audited)' })).toBeTruthy();
});

it('does not display a late recovery-secret response after the recovery section closes', async () => {
  getUpdateStatus.mockResolvedValue({
    management: 'managed',
    sessionId: 7,
    update: null,
    physicalQualification: 'unverified',
  });
  let finish!: (value: { password: string }) => void;
  getRootPassword.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Runtime updates' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Administrator recovery' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reveal root password (audited)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Administrator recovery' }));
  finish({ password: 'late-secret' });
  fireEvent.click(screen.getByRole('button', { name: 'Administrator recovery' }));
  expect(await screen.findByRole('button', { name: 'Reveal root password (audited)' })).toBeTruthy();
  expect(screen.queryByText('late-secret')).toBeNull();
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
