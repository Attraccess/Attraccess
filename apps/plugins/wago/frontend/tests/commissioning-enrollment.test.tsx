import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { CommissioningModal } from '../src/CommissioningModal';
import type { CommissioningSession } from '../src/api';

vi.mock('../src/drawer', () => ({
  StandardDrawer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../src/ControllersTable', () => ({ commissioningLabel: (state: string) => state }));

let client: QueryClient;
let session: CommissioningSession;
let deliveries: unknown[];
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  deliveries = [];
  session = {
    id: 7,
    hardwareId: 'fixture',
    mqttServerId: 1,
    targetHost: '192.0.2.7',
    controllerName: 'Fixture',
    hostKeyFingerprint: 'SHA256:fixture',
    firmwareBaseline: '31',
    state: 'delivery_failed',
    enrollmentExpiresAt: null,
    codesysState: null,
    progressPercent: 70,
    progressStep: 'Delivery failed',
    progressDetail: null,
    auditLog: '[]',
    failureReason: 'Connection interrupted',
    createdAt: '',
    updatedAt: '',
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/deliver')) deliveries.push(JSON.parse(String(options?.body)));
      const data = url.endsWith('/deliver')
        ? session
        : url.endsWith('/verification')
          ? {
              controllerId: null,
              permanentConnection: true,
              enrollmentRevoked: true,
              configurationApplied: true,
              hardwareReadiness: 'ready',
              managementHardening: 'unverified',
            }
          : url.includes('/commissioning/sessions')
            ? [session]
            : url.endsWith('/settings')
              ? { defaultMqttServerId: 1 }
              : [];
      return new Response(JSON.stringify(data), { status: 200 });
    }),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <CommissioningModal isOpen session={session} onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );

describe('automatic enrollment', () => {
  it('retries a retained installation without manual cleanup, credentials or another checkbox', async () => {
    session.runtimeRecoveryAvailable = true;
    session.dockerProvisionState = 'recovery_required';
    mount();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Clean up/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry installation' }));
    await waitFor(() => expect(deliveries).toEqual([{ confirmInstall: true }]));
  });

  it('shows installation as an active stage after upload, not completed enrollment', () => {
    Object.assign(session, {
      state: 'delivering',
      progressStep: 'Installing runtime',
      failureReason: null,
      progressDetail: 'Upload complete. Installing the runtime and verifying its controller supervisor.',
    });
    mount();
    expect(screen.getByText('Installing runtime')).toBeTruthy();
    expect(screen.getByText('70%')).toBeTruthy();
    expect(screen.queryByText('100%')).toBeNull();
    expect(screen.queryByText('Enrollment verified')).toBeNull();
  });

  it('shows completed enrollment without falsely claiming physical qualification or hardening', async () => {
    Object.assign(session, {
      state: 'completed',
      progressPercent: 100,
      progressStep: 'Enrollment complete',
      failureReason: null,
    });
    mount();
    expect(await screen.findByText('Enrollment verified')).toBeTruthy();
    expect(await screen.findByText('Physical qualification: required before production use')).toBeTruthy();
    expect(screen.getByText('Management hardening: unverified')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry installation' })).toBeNull();
  });
});
