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
let activeSession: CommissioningSession;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 3 } } });
  requests = [];
  failInstall = false;
  activeSession = { ...session };
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    requests.push({ url, body: options?.body as string | undefined });
    const isInstall = url.endsWith('/deliver');
    const data = isInstall ? activeSession : url.includes('/commissioning/sessions') ? [activeSession] : url.endsWith('/settings') ? { defaultMqttServerId: 1 } : [];
    return { ok: !(isInstall && failInstall), status: 400, json: async () => ({ message: 'Installation failed' }), text: async () => JSON.stringify(data) };
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
    fireEvent.click(screen.getByRole('checkbox'));
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
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(view(false));
    rerender(view(true));
    expect((screen.getByLabelText('Temporary SSH password') as HTMLInputElement).value).toBe('');
    fillCredentials();
    expect(screen.getByRole('button', { name: 'Install runtime' }).hasAttribute('disabled')).toBe(true);
  });
});
