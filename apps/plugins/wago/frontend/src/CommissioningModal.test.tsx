import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { CommissioningSession } from './api';
import { CommissioningModal } from './CommissioningModal';

vi.mock('./drawer', () => ({
  StandardDrawer: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) => isOpen ? <div>{children}</div> : null,
}));
vi.mock('./ControllersTable', () => ({ commissioningLabel: (state: string) => state }));

const session: CommissioningSession = {
  id: 7, hardwareId: 'test-controller', mqttServerId: 1, targetHost: '192.0.2.7',
  controllerName: 'Test controller', hostKeyFingerprint: 'SHA256:test', firmwareBaseline: '31',
  state: 'awaiting_delivery', enrollmentExpiresAt: null, codesysState: null,
  progressPercent: 0, progressStep: null, progressDetail: null, auditLog: '[]',
  failureReason: null, createdAt: '', updatedAt: '',
};

let client: QueryClient;
let requests: Array<{ url: string; body: string | undefined }>;
let failInstall: boolean;
let failRecovery: boolean;
let activeSession: CommissioningSession;
let verificationControllerId: number | null;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 3 } } });
  requests = [];
  failInstall = false;
  failRecovery = false;
  activeSession = { ...session };
  verificationControllerId = null;
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    requests.push({ url, body: options?.body as string | undefined });
    const isInstall = url.endsWith('/deliver');
    const isRecovery = url.endsWith('/recover');
    const data = isInstall || isRecovery ? activeSession : url.endsWith('/management') ? null : url.endsWith('/operation') ? { state: 'available' } : url.endsWith('/verification') ? { controllerId: verificationControllerId, permanentConnection: false, enrollmentRevoked: false, configurationApplied: false } : url.includes('/commissioning/sessions') ? [activeSession] : url.endsWith('/settings') ? { defaultMqttServerId: 1 } : [];
    return { ok: !(isInstall && failInstall) && !(isRecovery && failRecovery), status: 400, json: async () => ({ message: isRecovery ? 'Runtime snapshot unavailable' : 'Installation failed' }), text: async () => JSON.stringify(data) };
  }));
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

function mount() {
  const onOpenChange = vi.fn();
  const view = (isOpen: boolean) => <QueryClientProvider client={client}><CommissioningModal isOpen={isOpen} session={activeSession} onOpenChange={onOpenChange} /></QueryClientProvider>;
  return { ...render(view(true)), view, onOpenChange };
}

function enableCustomCredentials() {
  if (!screen.queryByLabelText('Temporary SSH username'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use different SSH credentials' }));
}

function fillCredentials() {
  enableCustomCredentials();
  fireEvent.change(screen.getByLabelText('Temporary SSH username'), { target: { value: 'operator' } });
  fireEvent.change(screen.getByLabelText('Temporary SSH password'), { target: { value: 'test-only-password' } });
}

function fillRecoveryCredentials() {
  fireEvent.change(screen.getByLabelText('Recovery SSH username'), { target: { value: 'recovery-operator' } });
  fireEvent.change(screen.getByLabelText('Recovery SSH password'), { target: { value: 'recovery-secret' } });
}

describe('FW31 software support boundary', () => {
  it('keeps runtime checks automatic instead of presenting a saved inspection', () => {
    activeSession.platformReport = JSON.stringify({
      clock: {
        hostUtc: '2026-09-06T18:00:00.000Z',
        controllerUtc: '2026-09-06T18:00:00.000Z',
        previousSkewSeconds: -134972158,
        skewSeconds: 0,
        uncertaintySeconds: 1,
        observation: 'after-action',
        tool: 'supported',
        action: 'synchronize',
        result: 'synchronized',
      },
    });
    mount();
    expect(screen.getByText(/Attraccess verifies the controller automatically/)).toBeTruthy();
    expect(screen.queryByText('Saved clock result (not live)')).toBeNull();
    expect(screen.queryByRole('button', { name: /Inspect installation prerequisites/ })).toBeNull();
    expect(requests.some(({ url }) => url.endsWith('/inspect'))).toBe(false);
  });
  it.each([null, 'starting'] as const)('does not expose a separate preparation cleanup action (%s)', (state) => {
    activeSession.platformReport = JSON.stringify({
      version: '1', platform: 'supported', hardware: 'accessible', exclusivity: 'clear',
      docker: 'installed-stopped', configDocker: 'present',
      provision: 'review-start-installed-runtime', qualification: 'required',
    });
    activeSession.dockerProvisionState = state;
    mount();
    expect(screen.queryByRole('button', { name: 'Clean up controller preparation' })).toBeNull();
  });
  it('does not expose saved prerequisite details', () => {
    activeSession.platformReport = JSON.stringify({
      version: '1',
      platform: 'supported',
      hardware: 'uid10001-access-denied',
      exclusivity: 'codesys-boot-enabled',
      docker: 'installed-stopped',
      configDocker: 'present',
      provision: 'unsupported-lifecycle-dependencies',
      qualification: 'required',
    });
    mount();
    expect(screen.queryByText(/CODESYS is configured to start at boot/)).toBeNull();
    expect(screen.queryByText(/Installation must validate a supported activation path/)).toBeNull();
  });
  it('does not offer activation for an unsupported firmware report even when an installed runtime is stopped', () => {
    activeSession.platformReport = JSON.stringify({
      version: '1',
      platform: 'unsupported-firmware',
      hardware: 'accessible',
      exclusivity: 'clear',
      docker: 'installed-stopped',
      configDocker: 'present',
      provision: 'review-start-installed-runtime',
      qualification: 'required',
    });
    mount();
    expect(screen.queryByText(/BSP version alone is insufficient/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Inspect installation prerequisites/ })).toBeNull();
  });
  it.each(['codesys-active', 'codesys-boot-enabled'])('does not display saved %s inspection details after a later failure', (exclusivity) => {
    activeSession.state = 'delivery_failed';
    activeSession.dockerProvisionState = 'started';
    activeSession.codesysState = 'disabled';
    activeSession.platformReport = JSON.stringify({
      version: '1', platform: 'supported', hardware: 'accessible', exclusivity,
      docker: 'running', configDocker: 'present', provision: 'prepare-controller',
      qualification: 'software-supported',
    });
    mount();
    expect(screen.queryByText(/Controller preparation verified CODESYS stopped and permanently disabled/)).toBeNull();
    expect(screen.queryByText(exclusivity, { exact: true })).toBeNull();
  });
  it('does not repeat a saved CODESYS warning when disabling failed', () => {
    activeSession.state = 'delivery_failed';
    activeSession.dockerProvisionState = 'recovery_required';
    activeSession.codesysState = 'active';
    activeSession.platformReport = JSON.stringify({
      version: '1', platform: 'supported', hardware: 'accessible', exclusivity: 'codesys-active',
      docker: 'running', configDocker: 'present', provision: 'prepare-controller',
      qualification: 'software-supported',
    });
    mount();
    expect(screen.queryByText(/CODESYS is active/)).toBeNull();
  });
});

describe('explicit recovery approval', () => {
  beforeEach(() => {
    activeSession.runtimeRecoveryAvailable = true;
  });

  it.each([false, undefined])('does not offer preparation cleanup without runtime recovery ownership (%s)', (available) => {
    activeSession.state = 'delivery_failed';
    activeSession.dockerProvisionState = 'recovery_required';
    activeSession.runtimeRecoveryAvailable = available;
    mount();
    expect(screen.queryByRole('button', { name: 'Clean up failed installation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clean up controller preparation' })).toBeNull();
  });

  it('routes cleanup through the runtime when both installation and preparation records exist', () => {
    activeSession.state = 'delivery_failed';
    activeSession.dockerProvisionState = 'started';
    activeSession.runtimeRecoveryAvailable = true;
    mount();
    expect(screen.getByRole('button', { name: 'Clean up failed installation' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clean up controller preparation' })).toBeNull();
  });

  it('exposes guarded record deletion for revoked commissioning history', async () => {
    activeSession.state = 'revoked';
    const { onOpenChange } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Delete commissioning record' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(vi.mocked(fetch).mock.calls.some(([url, options]) => String(url).endsWith('/commissioning/sessions/7') && options?.method === 'DELETE')).toBe(true);
  });
  it('opens the existing visual configuration workflow without claiming hardware qualification', async () => {
    activeSession.state = 'awaiting_verification';
    verificationControllerId = 5;
    const onConfigure = vi.fn();
    render(<QueryClientProvider client={client}><CommissioningModal isOpen session={activeSession} onOpenChange={vi.fn()} onConfigure={onConfigure} /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Configure inputs and outputs' }));
    expect(onConfigure).toHaveBeenCalledWith(5);
    expect(screen.getByText('Physical qualification: required before production use')).toBeTruthy();
  });
  it.each(['delivery_failed', 'awaiting_discovery', 'awaiting_verification'] as const)('offers manual recovery in %s without starting it', (state) => {
    activeSession.state = state;
    mount();
    expect(screen.getByRole('button', { name: 'Clean up failed installation' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/cannot undo broker credential revocation/)).toBeTruthy();
    expect(requests.filter(({ url }) => url.endsWith('/recover'))).toHaveLength(0);
  });

  it.each([false, true])('requires separate consent, scrubs credentials, and never retries (failure=%s)', async (failure) => {
    activeSession.state = 'delivery_failed';
    failRecovery = failure;
    mount();
    const recover = screen.getByRole('button', { name: 'Clean up failed installation' });
    fillCredentials();
    fireEvent.click(screen.getByRole('checkbox', { name: /I approve this destructive installation/ }));
    expect((screen.getByLabelText('Recovery SSH password') as HTMLInputElement).value).toBe('');
    fillRecoveryCredentials();
    expect(recover.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /I approve interrupting/ }));
    fireEvent.click(recover);
    expect((screen.getByLabelText('Recovery SSH password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Recovery SSH username') as HTMLInputElement).value).toBe('');
    await waitFor(() => expect(requests.filter(({ url }) => url.endsWith('/recover'))).toHaveLength(1));
    expect(JSON.parse(requests.find(({ url }) => url.endsWith('/recover'))?.body ?? '{}')).toEqual({ confirmInstall: true, temporarySsh: { username: 'recovery-operator', password: 'recovery-secret' } });
    await waitFor(() => expect(client.isMutating()).toBe(0));
    const mutations = client.getMutationCache().getAll();
    expect(mutations.every((mutation) => mutation.options.retry === false)).toBe(true);
    const variables = JSON.stringify(mutations.map((mutation) => mutation.state.variables));
    expect(variables).not.toContain('recovery-secret');
    expect(variables).not.toContain('recovery-operator');
    expect(variables).not.toContain('"confirmInstall":true');
    if (failure) expect(screen.getByText('Runtime snapshot unavailable')).toBeTruthy();
    fillRecoveryCredentials();
    expect(recover.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Retry installation' }).hasAttribute('disabled')).toBe(true);
    expect(requests.filter(({ url }) => url.endsWith('/deliver'))).toHaveLength(0);
  });

  it.each(['external', 'button', 'session'])('clears recovery credentials and consent on %s close/change', (mode) => {
    activeSession.state = 'awaiting_discovery';
    const { rerender, view } = mount();
    fillRecoveryCredentials();
    fireEvent.click(screen.getByRole('checkbox', { name: /I approve interrupting/ }));
    if (mode === 'button') fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    if (mode === 'session') activeSession = { ...activeSession, id: 8 };
    else rerender(view(false));
    rerender(view(true));
    expect((screen.getByLabelText('Recovery SSH password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Recovery SSH username') as HTMLInputElement).value).toBe('');
    fillRecoveryCredentials();
    expect(screen.getByRole('button', { name: 'Clean up failed installation' }).hasAttribute('disabled')).toBe(true);
    expect(requests.filter(({ url }) => url.endsWith('/recover'))).toHaveLength(0);
  });

  it('targets the newly opened session after an earlier recovery', async () => {
    activeSession.state = 'awaiting_discovery';
    const { rerender, view } = mount();
    fillRecoveryCredentials();
    fireEvent.click(screen.getByRole('checkbox', { name: /I approve interrupting/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Clean up failed installation' }));
    await waitFor(() => expect(requests.filter(({ url }) => url.endsWith('/7/recover'))).toHaveLength(1));
    await waitFor(() => expect(client.isMutating()).toBe(0));
    activeSession = { ...activeSession, id: 8 };
    rerender(view(true));
    fillRecoveryCredentials();
    fireEvent.click(screen.getByRole('checkbox', { name: /I approve interrupting/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Clean up failed installation' }));
    await waitFor(() => expect(requests.filter(({ url }) => url.endsWith('/8/recover'))).toHaveLength(1));
  });
});

describe('explicit install approval', () => {
  it('shows the saved API root cause and the privileged factory account', () => {
    activeSession.state = 'delivery_failed';
    activeSession.failureReason = 'Checking controller identity and SSH access (admin@192.0.2.7): SSH login succeeded, but this account is not permitted to run commissioning commands with sudo.';
    mount();
    expect(screen.getByText(activeSession.failureReason)).toBeTruthy();
    expect(screen.getByText(/factory root \/ wago SSH credentials/)).toBeTruthy();
    expect(screen.queryByLabelText('Temporary SSH username')).toBeNull();
  });

  it.each(['codesys-active', 'codesys-boot-enabled'])('uses one consequence confirmation for %s without preservation or WBM gates', (exclusivity) => {
    activeSession.platformReport = JSON.stringify({
      version: '1', platform: 'supported', hardware: 'uid10001-access-denied', exclusivity,
      docker: 'installed-stopped', configDocker: 'present', provision: 'prepare-controller',
      qualification: 'software-supported',
    });
    mount();
    expect(screen.getByText('Destructive installation')).toBeTruthy();
    expect(screen.getByText(/Existing workloads may stop or be erased/)).toBeTruthy();
    expect(screen.getAllByRole('checkbox', { name: /I approve this destructive installation/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Recover saved runtime' })).toBeNull();
    fillCredentials();
    const install = screen.getByRole('button', { name: 'Install runtime' });
    expect(install.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /existing applications and data may be lost/ }));
    expect(install.hasAttribute('disabled')).toBe(false);
    expect(requests.filter(({ body }) => body)).toHaveLength(0);
  });

  it.each([false, true])('requires fresh consent and clears secrets after submission (failure=%s)', async (failure) => {
    failInstall = failure;
    if (failure) activeSession.state = 'delivery_failed';
    mount();
    const install = screen.getByRole('button', { name: failure ? 'Retry installation' : 'Install runtime' });
    enableCustomCredentials();
    expect((screen.getByLabelText('Temporary SSH username') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Temporary SSH password') as HTMLInputElement).value).toBe('');
    expect(install.hasAttribute('disabled')).toBe(true);
    fillCredentials();
    expect(install.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /I approve this destructive installation/ }));
    fireEvent.click(install);
    expect((screen.getByLabelText('Temporary SSH password') as HTMLInputElement).value).toBe('');
    await waitFor(() => expect(requests.filter(({ url }) => url.endsWith('/deliver'))).toHaveLength(1));
    const request = requests.find(({ url }) => url.endsWith('/deliver'));
    expect(JSON.parse(request?.body ?? '{}')).toEqual({ confirmInstall: true, temporarySsh: { username: 'operator', password: 'test-only-password' } });
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(JSON.stringify(client.getMutationCache().getAll().map((mutation) => mutation.state.variables))).not.toContain('test-only-password');
    expect(JSON.stringify(client.getMutationCache().getAll().map((mutation) => mutation.state.variables))).not.toContain('"confirmInstall":true');
    expect(install.hasAttribute('disabled')).toBe(true);
    // A new password alone cannot reuse the previous approval.
    fillCredentials();
    expect(install.hasAttribute('disabled')).toBe(true);
    expect(requests.filter(({ url }) => url.endsWith('/deliver'))).toHaveLength(1);
  });

  it('clears the password and consent when closed externally and reopened', () => {
    const { rerender, view } = mount();
    fillCredentials();
    fireEvent.click(screen.getByRole('checkbox', { name: /I approve this destructive installation/ }));
    rerender(view(false));
    rerender(view(true));
    enableCustomCredentials();
    expect((screen.getByLabelText('Temporary SSH password') as HTMLInputElement).value).toBe('');
    fillCredentials();
    expect(screen.getByRole('button', { name: 'Install runtime' }).hasAttribute('disabled')).toBe(true);
    expect(requests.filter(({ url }) => url.endsWith('/deliver'))).toHaveLength(0);
  });

  it('clears the password and consent on the Close button', () => {
    const { rerender, view, onOpenChange } = mount();
    fillCredentials();
    fireEvent.click(screen.getByRole('checkbox', { name: /I approve this destructive installation/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(view(false));
    rerender(view(true));
    enableCustomCredentials();
    expect((screen.getByLabelText('Temporary SSH password') as HTMLInputElement).value).toBe('');
    fillCredentials();
    expect(screen.getByRole('button', { name: 'Install runtime' }).hasAttribute('disabled')).toBe(true);
  });
});
