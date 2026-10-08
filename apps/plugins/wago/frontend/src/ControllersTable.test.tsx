import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CommissioningSession, CommissioningVerification, WagoController } from './api';
import { ControllersTable } from './ControllersTable';

const getVerification = vi.hoisted(() => vi.fn());
const getUpdateStatus = vi.hoisted(() => vi.fn());
const getRootPassword = vi.hoisted(() => vi.fn());
const getSessionStatus = vi.hoisted(() => vi.fn());
const retryRuntimeUpdate = vi.hoisted(() => vi.fn());
const retryManagedAccess = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({
  getCommissioningVerification: getVerification,
  getRuntimeUpdateStatus: getUpdateStatus,
  getRootRecoveryPassword: getRootPassword,
  getManagedAccessStatus: getSessionStatus,
  retryManagedAccess,
  retryRuntimeUpdate,
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
  runtimeVersion: '0.1.0',
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
  useTranslationState.setState({ language: 'en' });
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
  useTranslationState.setState({ language: 'en' });
  cleanup();
  useTranslationState.setState({ language: 'en' });
  client.clear();
  vi.clearAllMocks();
});

function mount(onResume = vi.fn(), onConfigure = vi.fn(), row = controller) {
  return render(
    <QueryClientProvider client={client}>
      <ControllersTable
        controllers={[row]}
        sessions={[session]}
        onResume={onResume}
        onConfigure={onConfigure}
        onClaim={vi.fn()}
        onRemove={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

async function openDetails(name = 'Fixture') {
  fireEvent.click(screen.getByRole('button', { name: `Details for ${name}` }));
  return await screen.findByRole('dialog');
}

it('hides "View progress" once enrollment is verified, keeping configuration and runtime info reachable', async () => {
  const onResume = vi.fn();
  const onConfigure = vi.fn();
  mount(onResume, onConfigure);
  expect(screen.queryByRole('button', { name: 'Setup progress' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Configure' }));
  await openDetails();
  expect(await screen.findByText('Setup complete')).toBeTruthy();
  expect(onConfigure).toHaveBeenCalledWith(1);
  expect(onResume).not.toHaveBeenCalled();
});

it('explains the destructive re-enrolment required for legacy controllers', async () => {
  mount();
  await openDetails();
  await screen.findByText('Setup complete');
  expect(await screen.findByText('Re-enrolment required')).toBeTruthy();
  expect(screen.getByText(/wipes applications, data and configuration/)).toBeTruthy();
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Runtime updates' })).toBeNull();
});

it('does not ask users to resume commissioning when verified management finishes automatically', async () => {
  getUpdateStatus.mockResolvedValue({ management: 'verified', sessionId: 7, update: null });
  mount();
  await openDetails();
  await screen.findByText(/update access key is verified/i);
  expect(screen.queryByText(/Resume commissioning/i)).toBeNull();
  expect(screen.getByText(/automatically/i)).toBeTruthy();
  expect(screen.queryByText(/needs attention/)).toBeNull();
});

it('shows the saved SSH setup failure in the details drawer in the selected language', async () => {
  getUpdateStatus.mockResolvedValue({
    management: 'recovery_required',
    sessionId: 7,
    update: null,
    managementFailure:
      'Automatic SSH setup failed (key_commit). The update access key could not be confirmed on the controller. Another installation or supervisor check may still be running. Keep the controller connected and retry update access setup.',
  });
  mount();
  await openDetails();
  expect(await screen.findByText(/Another installation or supervisor check may still be running/)).toBeTruthy();
  act(() => useTranslationState.getState().setLanguage('de'));
  expect(
    screen.getByText(/Möglicherweise läuft noch eine Installation oder eine Prüfung der Laufzeitüberwachung/),
  ).toBeTruthy();
});

it('shows the actual configuration prerequisite and automatic SSH progress without a continue action', async () => {
  const status = {
    management: 'verified',
    sessionId: 7,
    update: null,
    managementSetup: { state: 'waiting', reason: 'configuration' },
  };
  getUpdateStatus.mockResolvedValue(status);
  const onConfigure = vi.fn();
  mount(vi.fn(), onConfigure);
  await openDetails();
  expect(await screen.findByText(/Select Configure, review and publish/)).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByRole('button', { name: 'Configure' })).toBeTruthy();
  act(() => useTranslationState.getState().setLanguage('de'));
  expect(screen.getByText(/prüfe und veröffentliche die Ein- und Ausgangskonfiguration/)).toBeTruthy();
  expect(screen.queryByText(/Setze die Inbetriebnahme fort/)).toBeNull();
  act(() => useTranslationState.getState().setLanguage('en'));
  getUpdateStatus.mockResolvedValue({ ...status, managementSetup: { state: 'running', reason: 'reboot' } });
  await client.invalidateQueries({ queryKey: ['wago', 'runtime-update', 1, null] });
  expect(
    await screen.findByRole('progressbar', { name: 'Rebooting the CC100 and checking secure update access…' }),
  ).toBeTruthy();
  expect(screen.queryByText(/Select Configure, review and publish/)).toBeNull();
  getUpdateStatus.mockResolvedValue({ management: 'managed', sessionId: 7, update: null });
  await client.invalidateQueries({ queryKey: ['wago', 'runtime-update', 1, null] });
  await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull());
  expect(screen.queryByText(/The update access key is verified/)).toBeNull();
  expect(getRootPassword).not.toHaveBeenCalled();
});

it('shows the specific runtime blocker and recovery steps when reconciliation has no update record', async () => {
  getUpdateStatus.mockResolvedValue({ management: 'managed', sessionId: 7, update: null, blocker: 'runtime_assets' });
  mount();
  await openDetails();
  expect(await screen.findByText(/missing or invalid CC100 runtime assets/)).toBeTruthy();
});

it('shows automatic update progress and before/after versions inline through completion', async () => {
  const status = {
    management: 'managed',
    sessionId: 7,
    runtimeUpdateRequired: true,
    runtime: {
      runningVersion: '0.1.0',
      runningImageId: 'sha256:aaaaaaaa',
      desiredVersion: '0.2.0',
      desiredImageId: 'sha256:bbbbbbbb',
    },
    update: {
      phase: 'staging',
      previousRuntimeVersion: '0.1.0',
      desiredRuntimeVersion: '0.2.0',
      previousImageId: 'sha256:aaaaaaaa',
      desiredImageId: 'sha256:bbbbbbbb',
      retryAt: 0,
    },
  };
  getUpdateStatus.mockResolvedValue(status);
  mount();
  expect(await screen.findByLabelText('Runtime v0.1.0 → v0.2.0')).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: 'Transferring software' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Runtime updates' })).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  act(() => useTranslationState.getState().setLanguage('de'));
  expect(screen.getByRole('progressbar', { name: 'Software wird geladen' })).toBeTruthy();
  act(() => useTranslationState.getState().setLanguage('en'));
  getUpdateStatus.mockResolvedValue({ ...status, update: { ...status.update, phase: 'verifying' } });
  await client.invalidateQueries({ queryKey: ['wago', 'runtime-update', 1, null] });
  expect(await screen.findByRole('progressbar', { name: 'Checking software' })).toBeTruthy();
  getUpdateStatus.mockResolvedValue({
    ...status,
    runtimeUpdateRequired: false,
    runtime: { ...status.runtime, runningVersion: '0.2.0', runningImageId: 'sha256:bbbbbbbb' },
    update: { ...status.update, phase: 'current' },
  });
  await client.invalidateQueries({ queryKey: ['wago', 'runtime-update', 1, null] });
  expect(await screen.findByText('Runtime updated')).toBeTruthy();
  expect(screen.getByLabelText('Runtime v0.1.0 → v0.2.0')).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  // A newer server release must replace the completed transition even before
  // the next update transaction has been persisted.
  getUpdateStatus.mockResolvedValue({
    ...status,
    runtimeUpdateRequired: false,
    runtime: {
      ...status.runtime,
      runningVersion: '0.2.0',
      runningImageId: 'sha256:bbbbbbbb',
      desiredVersion: '0.3.0',
      desiredImageId: 'sha256:cccccccc',
    },
    update: { ...status.update, phase: 'current' },
  });
  await client.invalidateQueries({ queryKey: ['wago', 'runtime-update', 1, null] });
  expect(await screen.findByLabelText('Runtime v0.2.0 → v0.3.0')).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: 'Update queued' })).toBeTruthy();
  expect(screen.queryByText('Runtime updated')).toBeNull();
  getUpdateStatus.mockRejectedValue(new Error('Connection lost'));
  await client.invalidateQueries({ queryKey: ['wago', 'runtime-update', 1, null] });
  expect(await screen.findByText('Status unavailable')).toBeTruthy();
  expect(screen.queryByText('Runtime updated')).toBeNull();
  expect(screen.queryByRole('progressbar')).toBeNull();
});

it('distinguishes builds sharing a version and shows failures without an active progress bar', async () => {
  getUpdateStatus.mockResolvedValue({
    management: 'managed',
    sessionId: 7,
    runtimeUpdateRequired: true,
    update: {
      phase: 'failed',
      previousRuntimeVersion: '0.1.0',
      desiredRuntimeVersion: '0.1.0',
      previousImageId: 'sha256:aaaaaaaa1234',
      desiredImageId: 'sha256:bbbbbbbb1234',
      failure: 'storage',
      storageDiagnostics: [{ path: '/var/lib', requiredKiB: 180396, availableKiB: 179724 }],
      retryAt: 0,
    },
  });
  mount();
  expect(await screen.findByLabelText('Runtime v0.1.0 (aaaaaaaa) → v0.1.0 (bbbbbbbb)')).toBeTruthy();
  expect(screen.queryByText(/insufficient free space/)).toBeNull();
  await openDetails();
  expect(await screen.findByText(/insufficient free space/)).toBeTruthy();
  expect(
    await screen.findByText('/var/lib needs 176.2 MiB; 175.5 MiB is available. At least 0.7 MiB more is needed.'),
  ).toBeTruthy();
  expect(await screen.findByText(/The previous runtime is running/)).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Retry runtime update' })).toBeNull();
});

it('shows an understandable fallback for future unknown update failures', async () => {
  getUpdateStatus.mockResolvedValue({
    management: 'managed',
    sessionId: 7,
    update: { phase: 'failed', failure: 'future-error', desiredImageId: 'sha256:desired', retryAt: 0 },
  });
  mount();
  await openDetails();
  expect(await screen.findByText(/An unrecognized update failure occurred/)).toBeTruthy();
  expect(screen.queryByText(/runtimeManagement.failures.future-error/)).toBeNull();
});

it('translates runtime retries and recovery in place when the host language changes', async () => {
  getUpdateStatus.mockResolvedValue({
    management: 'managed',
    sessionId: 7,
    update: { phase: 'failed', desiredImageId: 'sha256:desired', failure: 'readiness', retryAt: 0 },
  });
  mount();
  await openDetails();
  await screen.findByText(/Last failure: readiness/);
  act(() => useTranslationState.getState().setLanguage('de'));
  expect(screen.getByText(/Letzter Fehler: Betriebsbereitschaft/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Wiederherstellungsoptionen' }));
  expect(screen.getByRole('button', { name: 'Software-Update erneut versuchen' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Root-Passwort anzeigen (protokolliert)' })).toBeTruthy();
  expect(getRootPassword).not.toHaveBeenCalled();
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
  await openDetails();
  await screen.findByText('Setup complete');
  expect(await screen.findByText(/Last failure: readiness/)).toBeTruthy();
  expect(getRootPassword).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Recovery tools' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reveal root password (audited)' }));
  expect(await screen.findByText('fixture-recovery-secret')).toBeTruthy();
  expect(getRootPassword).toHaveBeenCalledWith(7);
  fireEvent.click(screen.getByRole('button', { name: 'Hide recovery password' }));
  expect(screen.queryByText('fixture-recovery-secret')).toBeNull();
});

it('does not infer enrollment verification from an online claimed row', async () => {
  getVerification.mockResolvedValue({ ...verified, enrollmentRevoked: false });
  mount();
  await openDetails();
  expect(await screen.findByText('Checking setup')).toBeTruthy();
  expect(screen.queryByText('Setup complete')).toBeNull();
});

it('withholds the runtime verified label while an enrolled controller requires an update', async () => {
  getUpdateStatus.mockResolvedValue({
    management: 'managed',
    sessionId: 7,
    runtimeUpdateRequired: true,
    update: null,
  });
  mount(vi.fn(), vi.fn(), { ...controller, connectivity: 'runtime_update' });
  expect(await screen.findByText('Software update')).toBeTruthy();
  expect(screen.queryByText('Setup complete')).toBeNull();
  expect(screen.getByRole('progressbar', { name: 'Update queued' })).toBeTruthy();
});

it('shows startup software verification without announcing or queuing an update', async () => {
  getUpdateStatus.mockResolvedValue({
    management: 'managed',
    sessionId: 7,
    runtimeUpdateRequired: true,
    runtime: {
      runningVersion: '0.1.0',
      runningImageId: null,
      desiredVersion: '0.1.0',
      desiredImageId: 'sha256:desired',
    },
    update: null,
  });
  mount(vi.fn(), vi.fn(), { ...controller, connectivity: 'runtime_check' });
  await waitFor(() => expect(getUpdateStatus).toHaveBeenCalled());
  await waitFor(() => expect(client.isFetching()).toBe(0));

  expect(screen.getByText('Checking software')).toBeTruthy();
  expect(screen.queryByText('Software update')).toBeNull();
  expect(screen.queryByRole('progressbar', { name: 'Update queued' })).toBeNull();
  expect(screen.getByText('v0.1.0')).toBeTruthy();
});

it('keeps an offline controller visibly not responding while runtime verification is pending', async () => {
  getUpdateStatus.mockResolvedValue({
    management: 'managed',
    sessionId: 7,
    runtimeUpdateRequired: true,
    update: null,
  });
  mount(vi.fn(), vi.fn(), { ...controller, connectivity: 'stale' });
  await waitFor(() => expect(getUpdateStatus).toHaveBeenCalled());
  await waitFor(() => expect(client.isFetching()).toBe(0));

  expect(screen.getByText('Not responding')).toBeTruthy();
  expect(screen.queryByText('Software update')).toBeNull();
  expect(screen.queryByRole('progressbar', { name: 'Update queued' })).toBeNull();
});

it('keeps an offline update failure visible without replacing connectivity with the pending image mismatch', async () => {
  getUpdateStatus.mockResolvedValue({
    management: 'managed',
    sessionId: 7,
    runtimeUpdateRequired: true,
    runtime: {
      runningVersion: '0.1.0',
      runningImageId: 'sha256:previous',
      desiredVersion: '0.2.0',
      desiredImageId: 'sha256:desired',
    },
    update: { phase: 'blocked', desiredImageId: 'sha256:desired', failure: 'offline' },
  });
  mount(vi.fn(), vi.fn(), { ...controller, connectivity: 'stale' });
  await waitFor(() => expect(getUpdateStatus).toHaveBeenCalled());
  await waitFor(() => expect(client.isFetching()).toBe(0));

  expect(screen.getByText('Not responding')).toBeTruthy();
  expect(screen.queryByText('Software update')).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('blocked');
  expect(screen.queryByRole('progressbar')).toBeNull();
});

it.each(['failed', 'blocked', 'recovery_required'])(
  'offers a runtime retry for a managed controller in %s without retrying enrolment',
  async (phase) => {
    getUpdateStatus.mockResolvedValue({
      management: 'managed',
      sessionId: 7,
      update: { phase, desiredImageId: 'sha256:desired', failure: 'readiness', retryAt: 0 },
    });
    mount();
    await openDetails();
    fireEvent.click(await screen.findByRole('button', { name: 'Recovery tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry runtime update' }));
    expect(retryRuntimeUpdate).toHaveBeenCalledWith(1);
  },
);

it('offers managed access retry for an enrolment requiring recovery', async () => {
  getUpdateStatus.mockResolvedValue({
    management: 'recovery_required',
    sessionId: 7,
    update: null,
  });
  mount();
  await openDetails();
  fireEvent.click(await screen.findByRole('button', { name: 'Recovery tools' }));
  const retry = screen.getByRole('button', { name: 'Retry update access setup' });
  expect((retry as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(retry);
  expect(retryManagedAccess).toHaveBeenCalledWith(7);
  expect(retryRuntimeUpdate).not.toHaveBeenCalled();
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
  expect(getSessionStatus).not.toHaveBeenCalled();
  await openDetails('fixture');
  expect(await screen.findByText('Automatic management retired')).toBeTruthy();
  expect(getSessionStatus).toHaveBeenCalledWith(7);
  expect(getRootPassword).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Recovery tools' }));
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
  await openDetails();
  fireEvent.click(await screen.findByRole('button', { name: 'Recovery tools' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reveal root password (audited)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Recovery tools' }));
  finish({ password: 'late-secret' });
  fireEvent.click(screen.getByRole('button', { name: 'Recovery tools' }));
  expect(await screen.findByRole('button', { name: 'Reveal root password (audited)' })).toBeTruthy();
  expect(screen.queryByText('late-secret')).toBeNull();
});

it('keeps configuration pending separate from verified enrollment', async () => {
  getVerification.mockResolvedValue({ ...verified, configurationApplied: false, hardwareReadiness: 'not_ready' });
  mount();
  await openDetails();
  expect(await screen.findByText('Configuration pending')).toBeTruthy();
});

it('withdraws cached success when verification polling fails', async () => {
  mount();
  await openDetails();
  await screen.findByText('Setup complete');
  getVerification.mockRejectedValue(new Error('offline'));
  await client.invalidateQueries({ queryKey: ['wago', 'commissioning-verification', 7] });
  expect(await within(screen.getByRole('dialog')).findByText('Status unavailable')).toBeTruthy();
  expect(screen.queryByText('Setup complete')).toBeNull();
});

it('keeps session recovery reachable when merged into an untrusted controller row', async () => {
  getSessionStatus.mockResolvedValue({ management: 'recovery_required', sessionId: 7, update: null });
  render(
    <QueryClientProvider client={client}>
      <ControllersTable
        controllers={[{ ...controller, trustState: 'untrusted' }]}
        sessions={[{ ...session, managedAccessAvailable: true }]}
        onResume={vi.fn()}
        onConfigure={vi.fn()}
        onClaim={vi.fn()}
        onRemove={vi.fn()}
      />
    </QueryClientProvider>,
  );
  await openDetails();
  expect(await screen.findByText('Managed SSH needs attention')).toBeTruthy();
  expect(getSessionStatus).toHaveBeenCalledWith(7);
  expect(getUpdateStatus).not.toHaveBeenCalled();
});

it('can transition between empty and populated collections without changing hook order', () => {
  const props = { sessions: [], onResume: vi.fn(), onConfigure: vi.fn(), onClaim: vi.fn(), onRemove: vi.fn() };
  const wrap = (controllers: WagoController[]) => (
    <QueryClientProvider client={client}>
      <ControllersTable {...props} controllers={controllers} />
    </QueryClientProvider>
  );
  const { rerender } = render(wrap([]));
  expect(screen.getByText('No controllers or commissioning sessions yet.')).toBeTruthy();
  rerender(wrap([controller]));
  expect(screen.getByText('Fixture')).toBeTruthy();
  rerender(wrap([]));
  expect(screen.getByText('No controllers or commissioning sessions yet.')).toBeTruthy();
});

it('keeps detailed failures and administrator controls out of the compact table', async () => {
  getUpdateStatus.mockResolvedValue({
    management: 'managed',
    sessionId: 7,
    update: { phase: 'failed', failure: 'storage', desiredImageId: 'sha256:desired', retryAt: 0 },
  });
  mount();
  const table = screen.getByRole('grid');
  expect(await within(table).findByText('Needs attention')).toBeTruthy();
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((element) => element.textContent),
  ).toEqual(['Device', 'Status', 'Software', 'Last seen', 'Actions']);
  expect(within(table).queryByText(/insufficient free space/)).toBeNull();
  expect(within(table).queryByRole('button', { name: 'Recovery tools' })).toBeNull();
  expect(within(table).queryByRole('button', { name: 'Remove' })).toBeNull();
  expect(within(table).getAllByRole('button')).toHaveLength(2);
  const drawer = await openDetails();
  expect(await within(drawer).findByText(/insufficient free space/)).toBeTruthy();
  expect(within(drawer).getByRole('button', { name: 'Remove' })).toBeTruthy();
});

it('renders and polls only the current page, and finds devices by name, ID and address', async () => {
  const fleet = Array.from({ length: 70 }, (_, index) => ({
    ...controller,
    id: index + 1,
    hardwareId: `cc100-${index + 1}`,
    name: `Workshop ${index + 1}`,
  }));
  render(
    <QueryClientProvider client={client}>
      <ControllersTable
        controllers={fleet}
        sessions={[{ ...session, state: 'completed', hardwareId: 'cc100-69', targetHost: '192.168.1.69' }]}
        onResume={vi.fn()}
        onConfigure={vi.fn()}
        onClaim={vi.fn()}
        onRemove={vi.fn()}
      />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(getUpdateStatus).toHaveBeenCalledTimes(25));
  const table = screen.getByRole('grid');
  expect(within(table).getAllByRole('row')).toHaveLength(26);
  expect(getUpdateStatus).not.toHaveBeenCalledWith(26);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await within(table).findByText('Workshop 26')).toBeTruthy();
  expect(within(table).queryByText('Workshop 1')).toBeNull();
  const search = screen.getByRole('searchbox');
  fireEvent.change(search, { target: { value: '192.168.1.69' } });
  expect(await within(table).findByText('Workshop 69')).toBeTruthy();
  expect(within(table).getAllByRole('row')).toHaveLength(2);
  expect(screen.queryByRole('navigation', { name: 'Controller pages' })).toBeNull();
  fireEvent.change(search, { target: { value: 'cc100-70' } });
  expect(await within(table).findByText('Workshop 70')).toBeTruthy();
  fireEvent.change(search, { target: { value: 'Workshop 68' } });
  expect(await within(table).findByText('Workshop 68')).toBeTruthy();
  fireEvent.change(search, { target: { value: 'does not exist' } });
  expect(await within(table).findByText('No matching controllers.')).toBeTruthy();
});

it('uses natural German column and registration labels', async () => {
  useTranslationState.setState({ language: 'de' });
  mount();
  const table = screen.getByRole('grid');
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((element) => element.textContent),
  ).toEqual(['Gerät', 'Status', 'Software', 'Zuletzt gesehen', 'Aktionen']);
  expect(screen.queryByText('Vertrauen')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Details zu Fixture' }));
  expect(await screen.findByText('Registriert')).toBeTruthy();
  expect(screen.queryByText('Übernommen')).toBeNull();
});

it('discards a recovery password response when the details drawer closes', async () => {
  getUpdateStatus.mockResolvedValue({ management: 'managed', sessionId: 7, update: null });
  let finish!: (value: { password: string }) => void;
  getRootPassword.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  mount();
  await openDetails();
  fireEvent.click(await screen.findByRole('button', { name: 'Recovery tools' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reveal root password (audited)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  finish({ password: 'late-drawer-secret' });
  await openDetails();
  fireEvent.click(await screen.findByRole('button', { name: 'Recovery tools' }));
  expect(screen.queryByText('late-drawer-secret')).toBeNull();
  expect(getRootPassword).toHaveBeenCalledTimes(1);
});

it('translates recognized saved failures on mounted controller rows while retaining unknown text', async () => {
  const reason = 'Commissioning was interrupted.';
  session.failureReason = reason;
  try {
    mount();
    await openDetails();
    await screen.findByText(reason);
    const count = getVerification.mock.calls.length;
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText(/Die Inbetriebnahme wurde unterbrochen/)).toBeTruthy();
    expect(getVerification.mock.calls.length).toBe(count);
  } finally {
    session.failureReason = null;
  }
});
