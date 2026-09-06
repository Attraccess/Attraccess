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

function fillCredentials() {
  fireEvent.change(screen.getByLabelText('Temporary SSH username'), { target: { value: 'operator' } });
  fireEvent.change(screen.getByLabelText('Temporary SSH password'), { target: { value: 'test-only-password' } });
}

function fillRecoveryCredentials() {
  fireEvent.change(screen.getByLabelText('Recovery SSH username'), { target: { value: 'recovery-operator' } });
  fireEvent.change(screen.getByLabelText('Recovery SSH password'), { target: { value: 'recovery-secret' } });
}

describe('explicit recovery approval', () => {
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
    expect(screen.getByRole('button', { name: 'Recover saved runtime' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/cannot undo broker credential revocation/)).toBeTruthy();
    expect(requests.filter(({ url }) => url.endsWith('/recover'))).toHaveLength(0);
  });

  it.each([false, true])('requires separate consent, scrubs credentials, and never retries (failure=%s)', async (failure) => {
    activeSession.state = 'delivery_failed';
    failRecovery = failure;
    mount();
    const recover = screen.getByRole('button', { name: 'Recover saved runtime' });
    fillCredentials();
    fireEvent.click(screen.getByRole('checkbox', { name: /I approve interruption/ }));
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
    expect(screen.getByRole('button', { name: 'Recover saved runtime' }).hasAttribute('disabled')).toBe(true);
    expect(requests.filter(({ url }) => url.endsWith('/recover'))).toHaveLength(0);
  });

  it('targets the newly opened session after an earlier recovery', async () => {
    activeSession.state = 'awaiting_discovery';
    const { rerender, view } = mount();
    fillRecoveryCredentials();
    fireEvent.click(screen.getByRole('checkbox', { name: /I approve interrupting/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Recover saved runtime' }));
    await waitFor(() => expect(requests.filter(({ url }) => url.endsWith('/7/recover'))).toHaveLength(1));
    await waitFor(() => expect(client.isMutating()).toBe(0));
    activeSession = { ...activeSession, id: 8 };
    rerender(view(true));
    fillRecoveryCredentials();
    fireEvent.click(screen.getByRole('checkbox', { name: /I approve interrupting/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Recover saved runtime' }));
    await waitFor(() => expect(requests.filter(({ url }) => url.endsWith('/8/recover'))).toHaveLength(1));
  });
});

describe('explicit install approval', () => {
  it.each([false, true])('requires fresh consent and clears secrets after submission (failure=%s)', async (failure) => {
    failInstall = failure;
    if (failure) activeSession.state = 'delivery_failed';
    mount();
    const install = screen.getByRole('button', { name: failure ? 'Retry installation' : 'Install runtime' });
    expect((screen.getByLabelText('Temporary SSH username') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Temporary SSH password') as HTMLInputElement).value).toBe('');
    expect(install.hasAttribute('disabled')).toBe(true);
    fillCredentials();
    expect(install.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /I approve interruption/ }));
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
    fireEvent.click(screen.getByRole('checkbox'));
    rerender(view(false));
    rerender(view(true));
    expect((screen.getByLabelText('Temporary SSH password') as HTMLInputElement).value).toBe('');
    fillCredentials();
    expect(screen.getByRole('button', { name: 'Install runtime' }).hasAttribute('disabled')).toBe(true);
    expect(requests.filter(({ url }) => url.endsWith('/deliver'))).toHaveLength(0);
  });

  it('clears the password and consent on the Close button', () => {
    const { rerender, view, onOpenChange } = mount();
    fillCredentials();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(view(false));
    rerender(view(true));
    expect((screen.getByLabelText('Temporary SSH password') as HTMLInputElement).value).toBe('');
    fillCredentials();
    expect(screen.getByRole('button', { name: 'Install runtime' }).hasAttribute('disabled')).toBe(true);
  });
});
