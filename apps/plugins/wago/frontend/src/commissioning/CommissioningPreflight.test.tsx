import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommissioningPlatformPreflight } from './CommissioningPlatformPreflight';
import type { CommissioningSession } from '../api/client';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';

const session: CommissioningSession = {
  id: 7,
  hardwareId: 'fixture',
  mqttServerId: 1,
  targetHost: '192.0.2.7',
  controllerName: 'Fixture',
  hostKeyFingerprint: 'SHA256:fixture',
  firmwareBaseline: '31',
  state: 'awaiting_delivery',
  enrollmentExpiresAt: null,
  codesysState: null,
  progressPercent: 0,
  progressStep: null,
  progressDetail: null,
  auditLog: '[]',
  failureReason: null,
  createdAt: '',
  updatedAt: '2026-09-22T10:00:00Z',
};
let client: QueryClient;
let response: unknown;
let fail: boolean;
let requests: Array<{ url: string; body?: Record<string, unknown> }>;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  response = { ...session, updatedAt: '2026-09-22T11:00:00Z', codesysState: 'disabled' };
  requests = [];
  fail = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      requests.push({ url, body: typeof options?.body === 'string' ? JSON.parse(options.body) : undefined });
      return {
        ok: !fail,
        status: 400,
        json: async () => ({ message: 'fixture rejected' }),
        text: async () => JSON.stringify(response),
      };
    }),
  );
});
afterEach(() => {
  cleanup();
  useTranslationState.setState({ language: 'en' });
  client.clear();
  vi.unstubAllGlobals();
});
function mountPreflight(value = session) {
  return render(
    <QueryClientProvider client={client}>
      <CommissioningPlatformPreflight session={value} />
    </QueryClientProvider>,
  );
}
function credentials(prefix: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Use a different SSH login' }));
  fireEvent.change(screen.getByLabelText(`${prefix} SSH username`), { target: { value: 'operator' } });
  fireEvent.change(screen.getByLabelText(`${prefix} SSH password`), { target: { value: 'fixture-password' } });
}
it('inspects using the factory login without prompting for SSH credentials', async () => {
  mountPreflight();
  expect(screen.queryByLabelText('Preflight SSH password')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Inspect installation prerequisites' }));
  await waitFor(() => expect(requests.some(({ url }) => url.endsWith('/platform/inspect'))).toBe(true));
  expect(requests.find(({ url }) => url.endsWith('/platform/inspect'))?.body?.temporarySsh).toEqual({
    username: 'root',
    password: 'wago',
  });
});
it('inspects with fresh credentials, clears fields, and updates only the matching cached session', async () => {
  client.setQueryData(['wago', 'commissioning-sessions'], [session, { ...session, id: 8 }]);
  mountPreflight();
  credentials('Preflight');
  fireEvent.click(screen.getByRole('button', { name: 'Inspect installation prerequisites' }));
  await screen.findByText(/preparation verified CODESYS stopped and permanently disabled/);
  expect(requests[0]).toEqual({
    url: expect.stringContaining('/api/wago/commissioning/sessions/7/platform/inspect'),
    body: {
      temporarySsh: { username: 'operator', password: 'fixture-password' },
      reviewedDockerActivation: false,
    },
  });
  expect(screen.queryByLabelText('Preflight SSH password')).toBeNull();
  expect(client.getQueryData(['wago', 'commissioning-sessions'])).toEqual([response, { ...session, id: 8 }]);
});
it('submits preparation cleanup once through its action button and reports a rejected recovery', async () => {
  mountPreflight({ ...session, dockerProvisionState: 'recovery_required', runtimeRecoveryAvailable: false });
  const button = screen.getByRole('button', { name: 'Clean up controller preparation' });
  expect((button as HTMLButtonElement).disabled).toBe(false);
  credentials('Preflight');
  fail = true;
  fireEvent.click(button);
  await screen.findByText(/Could not inspect or clean up/);
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toMatch(/\/platform\/recover$/);
  expect(requests[0].body?.reviewedDockerActivation).toBe(true);
  expect(screen.queryByLabelText('Preflight SSH password')).toBeNull();
});
it.each(['codesys-active', 'codesys-boot-enabled', 'output-container-conflict'])(
  'renders saved clock, platform, and exclusivity findings (%s)',
  (exclusivity) => {
    mountPreflight({
      ...session,
      failureReason: 'Fixture requires attention',
      platformReport: JSON.stringify({
        platform: 'supported',
        hardware: 'accessible',
        exclusivity,
        provision: 'unsupported-lifecycle-dependencies',
        clock: {
          result: 'correction-required',
          hostUtc: 'host-clock',
          controllerUtc: 'controller-clock',
          observation: 'before-action',
          uncertaintySeconds: 2,
          skewSeconds: 300,
          previousSkewSeconds: 500,
          tool: 'supported',
          action: 'synchronize',
        },
      }),
    });
    expect(screen.getByText('host-clock')).toBeTruthy();
    expect(screen.getByText('300 seconds')).toBeTruthy();
    expect(screen.getByText('500 seconds')).toBeTruthy();
    expect(screen.getByText('Fixture requires attention')).toBeTruthy();
    expect(screen.getByText(/could not verify the Docker lifecycle dependencies/)).toBeTruthy();
    expect(requests).toHaveLength(0);
  },
);

it.each(['Commissioning was interrupted.', 'unknown failure <controller>'])(
  'switches saved failure feedback and UTC clock formatting without inspecting again: %s',
  (failureReason) => {
    const hostUtc = '2026-09-22T10:00:00Z';
    mountPreflight({
      ...session,
      failureReason,
      platformReport: JSON.stringify({
        clock: {
          hostUtc,
          controllerUtc: 'unavailable',
          result: 'synchronized',
          observation: 'before-action',
          uncertaintySeconds: 2,
          skewSeconds: 0,
          tool: 'supported',
          action: 'none',
        },
      }),
    });
    expect(
      screen.getByText(new Date(hostUtc).toLocaleString('en', { timeZone: 'UTC', timeZoneName: 'short' })),
    ).toBeTruthy();
    expect(screen.getByText(failureReason)).toBeTruthy();
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(
      screen.getByText(new Date(hostUtc).toLocaleString('de', { timeZone: 'UTC', timeZoneName: 'short' })),
    ).toBeTruthy();
    expect(screen.getByText('Nicht verfügbar')).toBeTruthy();
    expect(
      screen.getByText(
        failureReason === 'Commissioning was interrupted.' ? 'Die Inbetriebnahme wurde unterbrochen.' : failureReason,
      ),
    ).toBeTruthy();
    expect(requests).toHaveLength(0);
  },
);
