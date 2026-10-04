import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { CommissioningSession, CommissioningVerification } from './api';
import { CommissioningModal } from './CommissioningModal';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';

vi.mock('./drawer', () => ({
  StandardDrawer: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
vi.mock('./ControllersTable', () => ({
  commissioningLabel: (state: string) => state,
  RuntimeUpdateDetails: () => <div>Managed recovery controls</div>,
}));

const session: CommissioningSession = {
  id: 7,
  hardwareId: 'test-controller',
  mqttServerId: 1,
  targetHost: '192.0.2.7',
  controllerName: 'Test controller',
  hostKeyFingerprint: 'SHA256:test',
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
  updatedAt: '',
};

let client: QueryClient;
let requests: Array<{ url: string; body: string | undefined }>;
let failInstall: boolean;
let failRecovery: boolean;
let activeSession: CommissioningSession;
let verificationControllerId: number | null;
let verificationOverrides: Partial<CommissioningVerification>;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 3 } } });
  requests = [];
  failInstall = false;
  failRecovery = false;
  activeSession = { ...session };
  verificationControllerId = null;
  verificationOverrides = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      requests.push({ url, body: options?.body as string | undefined });
      const isInstall = url.endsWith('/deliver');
      const isRecovery = url.endsWith('/recover');
      const data =
        isInstall || isRecovery
          ? activeSession
          : url.endsWith('/management')
            ? null
            : url.endsWith('/operation')
              ? { state: 'available' }
              : url.endsWith('/verification')
                ? {
                    controllerId: verificationControllerId,
                    permanentConnection: false,
                    enrollmentRevoked: false,
                    configurationApplied: false,
                    ...verificationOverrides,
                  }
                : url.includes('/commissioning/sessions')
                  ? [activeSession]
                  : url.endsWith('/settings')
                    ? { defaultMqttServerId: 1 }
                    : [];
      return {
        ok: !(isInstall && failInstall) && !(isRecovery && failRecovery),
        status: 400,
        json: async () => ({ message: isRecovery ? 'Runtime snapshot unavailable' : 'Installation failed' }),
        text: async () => JSON.stringify(data),
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

function mount() {
  const onOpenChange = vi.fn();
  const view = (isOpen: boolean) => (
    <QueryClientProvider client={client}>
      <CommissioningModal isOpen={isOpen} session={activeSession} onOpenChange={onOpenChange} />
    </QueryClientProvider>
  );
  return { ...render(view(true)), view, onOpenChange };
}

it('keeps a freshly resumed session instead of regressing to an older cached response', async () => {
  const old = { ...session, state: 'delivering' as const, progressPercent: 20, updatedAt: '2026-01-01T00:00:00Z' };
  client.setQueryData(['wago', 'commissioning-sessions'], [old]);
  activeSession = {
    ...old,
    progressPercent: 55,
    progressStep: 'Transferring runtime',
    updatedAt: '2026-01-01T00:05:00Z',
  };
  const originalFetch = vi.mocked(fetch).getMockImplementation();
  if (!originalFetch) throw new Error('Fetch fixture is missing');
  vi.mocked(fetch).mockImplementation((url, options) =>
    String(url).includes('/commissioning/sessions?')
      ? Promise.resolve({ ok: true, text: async () => JSON.stringify([old]) } as Response)
      : originalFetch(url, options),
  );
  mount();
  await waitFor(() => expect(screen.getByText('Transferring runtime')).toBeTruthy());
  expect(screen.getByText('55%')).toBeTruthy();
});

it('explains lost authentication without losing the last known controller progress', async () => {
  activeSession = { ...session, state: 'delivering', progressPercent: 20, updatedAt: new Date().toISOString() };
  const originalFetch = vi.mocked(fetch).getMockImplementation();
  if (!originalFetch) throw new Error('Fetch fixture is missing');
  vi.mocked(fetch).mockImplementation((url, options) =>
    String(url).includes('/commissioning/sessions?')
      ? Promise.resolve({ ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) } as Response)
      : originalFetch(url, options),
  );
  mount();
  await waitFor(() => expect(screen.getByText(/Your login has expired/)).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Refresh status' })).toBeTruthy();
  expect(screen.getByText('20%')).toBeTruthy();
});

it('shows when the controller last updated and the remaining operation time', async () => {
  const now = Date.now();
  activeSession = {
    ...session,
    state: 'delivering',
    progressPercent: 22,
    updatedAt: new Date(now - 125_000).toISOString(),
    operationDeadlineAt: new Date(now + 600_000).toISOString(),
  };
  mount();
  await waitFor(() => expect(screen.getByText(/Status checked \d+s ago/)).toBeTruthy());
  expect(screen.getByText(/Last controller update 2m/)).toBeTruthy();
  expect(screen.getByText(/Installation time limit/)).toBeTruthy();
});

it('shows the last controller checkpoint on the failure screen', async () => {
  activeSession = {
    ...session,
    state: 'delivery_failed',
    failureReason: 'Controller operation timed out.',
    progressStep: 'Delivery failed',
    auditLog: JSON.stringify([{ at: new Date().toISOString(), event: 'progress: Checking controller hardware' }]),
  };
  mount();
  await waitFor(() => expect(screen.getByText('Stopped while: Checking controller hardware')).toBeTruthy());
});

it('collects only name and IP when one broker is available, selects runtime automatically and supports form submission', async () => {
  vi.mocked(fetch).mockImplementation(async (url, options) => {
    const address = String(url);
    requests.push({ url: address, body: options?.body as string | undefined });
    const data = address.endsWith('/settings')
      ? { defaultMqttServerId: 1 }
      : address.endsWith('/mqtt/servers')
        ? [{ id: 1, name: 'Default broker' }]
        : address.endsWith('/runtime-artifacts/current')
          ? {
              image: 'bundled-image',
              bytes: 1024,
              digest: 'digest',
              manifest: { runtimeVersion: '0.1.0', hardware: { model: '751-9301', firmwareBaseline: '31' } },
            }
          : options?.method === 'POST'
            ? { ...activeSession, state: 'awaiting_identity_confirmation' }
            : address.includes('/commissioning/sessions')
              ? []
              : [];
    return { ok: true, text: async () => JSON.stringify(data) } as Response;
  });
  render(
    <QueryClientProvider client={client}>
      <CommissioningModal isOpen session={null} onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText('Controller name'), { target: { value: ' Workshop ' } });
  const nameForm = screen.getByLabelText('Controller name').closest('form');
  if (!nameForm) throw new Error('Name step must be a form');
  fireEvent.submit(nameForm);
  fireEvent.change(screen.getByLabelText('Controller IP address'), { target: { value: '10.77.0.7' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(false));
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByLabelText('Temporary SSH password')).toBeNull();
  const connectionForm = screen.getByLabelText('Controller IP address').closest('form');
  if (!connectionForm) throw new Error('Connection step must be a form');
  fireEvent.submit(connectionForm);
  await screen.findByRole('button', { name: 'Use this controller' });
  const request = requests.find(({ body }) => body?.includes('targetHost'));
  expect(JSON.parse(request?.body ?? '{}')).toEqual({ name: 'Workshop', targetHost: '10.77.0.7', mqttServerId: 1 });
});

it('shows a specific failure and only cleanup when an installation needs recovery', () => {
  activeSession = {
    ...session,
    state: 'delivery_failed',
    runtimeRecoveryAvailable: true,
    failureReason:
      'Managed SSH setup failed (proof). The new management SSH key could not be verified. Check SSH access on port 22 and the scoped sudo policy.',
  };
  mount();
  expect(screen.getByText(/Check SSH access on port 22/)).toBeTruthy();
  expect(screen.getByText('Controller: 192.0.2.7')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Clean up failed installation' }).hasAttribute('disabled')).toBe(false);
  expect(screen.queryByRole('button', { name: 'Retry installation' })).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
  act(() => useTranslationState.getState().setLanguage('de'));
  expect(screen.getByText(/Prüfe den SSH-Zugriff auf Port 22/)).toBeTruthy();
});

it('shows verified enrollment separately from unfinished configuration and management', async () => {
  activeSession.state = 'awaiting_verification';
  activeSession.progressStep = 'Verifying commissioned controller';
  activeSession.progressDetail = 'Claim sent. Permanent connection still requires verification.';
  verificationControllerId = 2;
  verificationOverrides = {
    permanentConnection: true,
    enrollmentRevoked: true,
    managementHardening: 'unverified',
  };
  mount();
  expect(await screen.findByText('Enrollment complete')).toBeTruthy();
  expect(screen.getByText('Runtime enrollment complete')).toBeTruthy();
  expect(screen.queryByText('Commissioning is not yet verified')).toBeNull();
  expect(screen.queryByText(activeSession.progressDetail)).toBeNull();
  expect(screen.getByText('Desired/reported configuration: pending')).toBeTruthy();
  expect(screen.getByText('Secure update access: unverified')).toBeTruthy();
});

it.each([false, true])(
  'switches verification and completed-summary statuses with the host language (complete: %s)',
  async (complete) => {
    activeSession.state = 'awaiting_verification';
    activeSession.updatedAt = '2026-09-06T18:00:00.000Z';
    verificationControllerId = 2;
    verificationOverrides = {
      permanentConnection: true,
      enrollmentRevoked: true,
      configurationApplied: complete,
      managementHardening: 'supported',
      hardwareReadiness: 'ready',
    };
    mount();
    await screen.findByText(complete ? 'supported' : 'Secure update access: supported');
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(
      screen.getByText(complete ? 'Unterstützt' : 'Sicherer Update-Zugang: Unterstützt'),
    ).toBeTruthy();
    if (!complete) expect(screen.getByText('Hardware-Prüfung der Laufzeitumgebung: Bereit')).toBeTruthy();
    act(() => useTranslationState.getState().setLanguage('en'));
    expect(screen.getByText(complete ? 'supported' : 'Secure update access: supported')).toBeTruthy();
  },
);

it.each(['permanentConnection', 'enrollmentRevoked'] as const)(
  'keeps enrollment pending when %s has not been verified',
  async (missing) => {
    activeSession.state = 'awaiting_verification';
    verificationControllerId = 2;
    verificationOverrides = { permanentConnection: true, enrollmentRevoked: true, [missing]: false };
    mount();
    await screen.findByText('Desired/reported configuration: pending');
    expect(screen.queryByText('Enrollment complete')).toBeNull();
  },
);

function fillCredentials() {
  if (!screen.queryByLabelText('Temporary SSH username'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Use a different SSH login' })[0]);
  fireEvent.change(screen.getByLabelText('Temporary SSH username'), { target: { value: 'operator' } });
  fireEvent.change(screen.getByLabelText('Temporary SSH password'), { target: { value: 'test-only-password' } });
}

function fillRecoveryCredentials() {
  if (!screen.queryByLabelText('Recovery SSH username')) {
    const switches = screen.getAllByRole('button', { name: 'Use a different SSH login' });
    fireEvent.click(switches[switches.length - 1]);
  }
  fireEvent.change(screen.getByLabelText('Recovery SSH username'), { target: { value: 'recovery-operator' } });
  fireEvent.change(screen.getByLabelText('Recovery SSH password'), { target: { value: 'recovery-secret' } });
}

describe('FW31 software support boundary', () => {
  it.each([
    ['starting', 'Wird gestartet'],
    ['started', 'Gestartet'],
    ['recovering', 'Wird wiederhergestellt'],
    ['restored', 'Wiederhergestellt'],
    ['recovery_required', 'Wiederherstellung erforderlich'],
    ['vendor.preparation-v2', 'vendor.preparation-v2'],
  ])('switches the saved preparation status without another request (%s)', async (state, german) => {
    activeSession.dockerProvisionState = state;
    mount();
    await screen.findByText((text) => text.startsWith(`Saved controller preparation: ${state}.`));
    const requestCount = requests.length;
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText((text) => text.startsWith(`Gespeicherte Steuerungsvorbereitung: ${german}.`))).toBeTruthy();
    act(() => useTranslationState.getState().setLanguage('en'));
    expect(screen.getByText((text) => text.startsWith(`Saved controller preparation: ${state}.`))).toBeTruthy();
    expect(requests).toHaveLength(requestCount);
    expect(requests.some(({ url }) => url.endsWith('/deliver') || url.endsWith('/inspect'))).toBe(false);
  });

  it('shows saved UTC skew, action and result without claiming live synchronization', () => {
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
    expect(screen.getByText('Saved clock result (not live)')).toBeTruthy();
    expect(screen.getByText('synchronized')).toBeTruthy();
    expect(screen.getByText('-134972158 seconds')).toBeTruthy();
    expect(screen.getByText('supported / synchronize')).toBeTruthy();
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText('Unterstützt / Synchronisieren')).toBeTruthy();
    expect(screen.getByText(/^Nach der Aktion; Unsicherheit 1 Sekunden\./)).toBeTruthy();
    act(() => useTranslationState.getState().setLanguage('en'));
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(requests.some(({ url }) => url.endsWith('/deliver') || url.endsWith('/inspect'))).toBe(false);
  });
  it.each([null, 'starting'] as const)(
    'suppresses stale saved activation while retaining pending recovery (%s)',
    (state) => {
      activeSession.platformReport = JSON.stringify({
        version: '1',
        platform: 'supported',
        hardware: 'accessible',
        exclusivity: 'clear',
        docker: 'installed-stopped',
        configDocker: 'present',
        provision: 'review-start-installed-runtime',
        qualification: 'required',
      });
      activeSession.dockerProvisionState = state;
      mount();
      expect(screen.queryByRole('button', { name: 'Start installed Docker runtime' })).toBeNull();
      expect(!!screen.queryByRole('button', { name: 'Clean up controller preparation' })).toBe(!!state);
      expect(requests.some(({ url }) => url.endsWith('/activate'))).toBe(false);
    },
  );
  it('explains mandatory PLC disablement and reports unsupported Docker dependencies', () => {
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
    expect(screen.queryByRole('button', { name: 'Start installed Docker runtime' })).toBeNull();
    expect(screen.getByText(/CODESYS is configured to start at boot/)).toBeTruthy();
    expect(screen.getByText(/Installation must validate a supported activation path/)).toBeTruthy();
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
    expect(screen.queryByRole('button', { name: 'Start installed Docker runtime' })).toBeNull();
    expect(screen.getByText(/BSP version alone is insufficient/)).toBeTruthy();
    expect(requests.some(({ url }) => url.endsWith('/activate'))).toBe(false);
  });
  it.each(['codesys-active', 'codesys-boot-enabled'])(
    'distinguishes saved %s inspection from verified preparation after a later failure',
    (exclusivity) => {
      activeSession.state = 'delivery_failed';
      activeSession.dockerProvisionState = 'started';
      activeSession.codesysState = 'disabled';
      activeSession.platformReport = JSON.stringify({
        version: '1',
        platform: 'supported',
        hardware: 'accessible',
        exclusivity,
        docker: 'running',
        configDocker: 'present',
        provision: 'prepare-controller',
        qualification: 'software-supported',
      });
      mount();
      expect(screen.getByText(/Controller preparation verified CODESYS stopped and permanently disabled/)).toBeTruthy();
      expect(screen.getByText(/Saved inspection snapshot; these values are not live controller status/)).toBeTruthy();
      expect(screen.getByText(exclusivity, { exact: true })).toBeTruthy();
      expect(screen.queryByText(/CODESYS is active/)).toBeNull();
      expect(screen.queryByText(/CODESYS is configured to start at boot/)).toBeNull();
    },
  );
  it('retains the active CODESYS warning when disabling failed', () => {
    activeSession.state = 'delivery_failed';
    activeSession.dockerProvisionState = 'recovery_required';
    activeSession.codesysState = 'active';
    activeSession.platformReport = JSON.stringify({
      version: '1',
      platform: 'supported',
      hardware: 'accessible',
      exclusivity: 'codesys-active',
      docker: 'running',
      configDocker: 'present',
      provision: 'prepare-controller',
      qualification: 'software-supported',
    });
    mount();
    expect(screen.getByText(/CODESYS is active/)).toBeTruthy();
    expect(screen.queryByText(/Controller preparation verified CODESYS stopped and permanently disabled/)).toBeNull();
  });
});

describe('explicit recovery action', () => {
  beforeEach(() => {
    activeSession.runtimeRecoveryAvailable = true;
  });

  it('uses the default root login for cleanup without another credential prompt', async () => {
    activeSession.state = 'delivery_failed';
    mount();
    expect(screen.queryByLabelText('Recovery SSH password')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clean up failed installation' }));
    await waitFor(() => expect(requests.filter(({ url }) => url.endsWith('/recover'))).toHaveLength(1));
    expect(JSON.parse(requests.find(({ url }) => url.endsWith('/recover'))?.body ?? '{}').temporarySsh).toEqual({
      username: 'root',
      password: 'wago',
    });
  });

  it.each([false, undefined])(
    'offers preparation cleanup alone without runtime recovery ownership (%s)',
    (available) => {
      activeSession.state = 'delivery_failed';
      activeSession.dockerProvisionState = 'recovery_required';
      activeSession.runtimeRecoveryAvailable = available;
      mount();
      expect(screen.queryByRole('button', { name: 'Clean up failed installation' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Clean up controller preparation' })).toBeTruthy();
    },
  );

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
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([url, options]) => String(url).endsWith('/commissioning/sessions/7') && options?.method === 'DELETE',
        ),
    ).toBe(true);
  });
  it('opens the existing visual configuration workflow without claiming hardware qualification', async () => {
    activeSession.state = 'awaiting_verification';
    verificationControllerId = 5;
    const onConfigure = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <CommissioningModal isOpen session={activeSession} onOpenChange={vi.fn()} onConfigure={onConfigure} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Configure inputs and outputs' }));
    expect(onConfigure).toHaveBeenCalledWith(5);
    expect(screen.getByText('Physical qualification: required before production use')).toBeTruthy();
  });
  it.each(['delivery_failed', 'awaiting_discovery', 'awaiting_verification'] as const)(
    'offers manual recovery in %s without starting it',
    (state) => {
      activeSession.state = state;
      mount();
      expect(screen.getByRole('button', { name: 'Clean up failed installation' }).hasAttribute('disabled')).toBe(false);
      expect(screen.getByText(/Previous applications and CODESYS are not restored/)).toBeTruthy();
      expect(requests.filter(({ url }) => url.endsWith('/recover'))).toHaveLength(0);
    },
  );

  it.each([false, true])(
    'uses a single cleanup action, scrubs credentials, and never retries (failure=%s)',
    async (failure) => {
      activeSession.state = 'delivery_failed';
      failRecovery = failure;
      mount();
      const recover = screen.getByRole('button', { name: 'Clean up failed installation' });
      expect(screen.queryByLabelText('Recovery SSH password')).toBeNull();
      fillRecoveryCredentials();
      expect(recover.hasAttribute('disabled')).toBe(false);
      fireEvent.click(recover);
      expect((screen.getByLabelText('Recovery SSH password') as HTMLInputElement).value).toBe('');
      await waitFor(() => expect(requests.filter(({ url }) => url.endsWith('/recover'))).toHaveLength(1));
      expect(JSON.parse(requests.find(({ url }) => url.endsWith('/recover'))?.body ?? '{}')).toEqual({
        confirmInstall: true,
        temporarySsh: { username: 'recovery-operator', password: 'recovery-secret' },
      });
      await waitFor(() => expect(client.isMutating()).toBe(0));
      const mutations = client.getMutationCache().getAll();
      expect(mutations.every((mutation) => mutation.options.retry === false)).toBe(true);
      const variables = JSON.stringify(mutations.map((mutation) => mutation.state.variables));
      expect(variables).not.toContain('recovery-secret');
      expect(variables).not.toContain('recovery-operator');
      expect(variables).not.toContain('"confirmInstall":true');
      if (failure) expect(screen.getByText('Runtime snapshot unavailable')).toBeTruthy();
      fillRecoveryCredentials();
      expect(recover.hasAttribute('disabled')).toBe(false);
      expect(screen.queryByRole('button', { name: 'Retry installation' })).toBeNull();
      expect(requests.filter(({ url }) => url.endsWith('/deliver'))).toHaveLength(0);
    },
  );

  it.each(['external', 'button', 'session'])('clears recovery credentials and consent on %s close/change', (mode) => {
    activeSession.state = 'awaiting_discovery';
    const { rerender, view } = mount();
    fillRecoveryCredentials();
    if (mode === 'button') fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    if (mode === 'session') activeSession = { ...activeSession, id: 8 };
    else rerender(view(false));
    rerender(view(true));
    expect(screen.queryByLabelText('Recovery SSH password')).toBeNull();
    expect(screen.queryByLabelText('Recovery SSH username')).toBeNull();
    fillRecoveryCredentials();
    expect(screen.getByRole('button', { name: 'Clean up failed installation' }).hasAttribute('disabled')).toBe(false);
    expect(requests.filter(({ url }) => url.endsWith('/recover'))).toHaveLength(0);
  });

  it('targets the newly opened session after an earlier recovery', async () => {
    activeSession.state = 'awaiting_discovery';
    const { rerender, view } = mount();
    fillRecoveryCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Clean up failed installation' }));
    await waitFor(() => expect(requests.filter(({ url }) => url.endsWith('/7/recover'))).toHaveLength(1));
    await waitFor(() => expect(client.isMutating()).toBe(0));
    activeSession = { ...activeSession, id: 8 };
    rerender(view(true));
    fillRecoveryCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Clean up failed installation' }));
    await waitFor(() => expect(requests.filter(({ url }) => url.endsWith('/8/recover'))).toHaveLength(1));
  });
});

describe('explicit install action', () => {
  it('does not query coordinator recovery or show an interrupted-operation gate', () => {
    mount();
    expect(requests.some(({ url }) => url.endsWith('/operation'))).toBe(false);
    expect(screen.queryByText('Interrupted coordinator recovery required')).toBeNull();
  });
  it('uses factory SSH access without asking for a password in the normal path', async () => {
    mount();
    expect(screen.queryByLabelText('Temporary SSH password')).toBeNull();
    expect(screen.getAllByText('SSH login: Default root account').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Install runtime' }));
    await waitFor(() => expect(requests.filter(({ url }) => url.endsWith('/deliver'))).toHaveLength(1));
    expect(JSON.parse(requests.find(({ url }) => url.endsWith('/deliver'))?.body ?? '{}').temporarySsh).toEqual({
      username: 'root',
      password: 'wago',
    });
  });
  it.each(['codesys-active', 'codesys-boot-enabled'])(
    'uses the install button as the consequence confirmation for %s without preservation or WBM gates',
    (exclusivity) => {
      activeSession.platformReport = JSON.stringify({
        version: '1',
        platform: 'supported',
        hardware: 'uid10001-access-denied',
        exclusivity,
        docker: 'installed-stopped',
        configDocker: 'present',
        provision: 'prepare-controller',
        qualification: 'software-supported',
      });
      mount();
      expect(screen.getByText('Before installing')).toBeTruthy();
      expect(screen.getByText(/Back up existing applications/)).toBeTruthy();
      expect(screen.getByText(/make connected equipment safe/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Recover saved runtime' })).toBeNull();
      fillCredentials();
      const install = screen.getByRole('button', { name: 'Install runtime' });
      expect(install.hasAttribute('disabled')).toBe(false);
      expect(install.hasAttribute('disabled')).toBe(false);
      expect(requests.filter(({ body }) => body)).toHaveLength(0);
    },
  );

  it.each([false, true])('submits once and clears secrets after submission (failure=%s)', async (failure) => {
    failInstall = failure;
    if (failure) activeSession.state = 'delivery_failed';
    mount();
    const install = screen.getByRole('button', { name: failure ? 'Retry installation' : 'Install runtime' });
    expect(screen.queryByLabelText('Temporary SSH username')).toBeNull();
    expect(screen.queryByLabelText('Temporary SSH password')).toBeNull();
    expect(install.hasAttribute('disabled')).toBe(false);
    fillCredentials();
    expect(install.hasAttribute('disabled')).toBe(false);
    fireEvent.click(install);
    expect((screen.getByLabelText('Temporary SSH password') as HTMLInputElement).value).toBe('');
    await waitFor(() => expect(requests.filter(({ url }) => url.endsWith('/deliver'))).toHaveLength(1));
    const request = requests.find(({ url }) => url.endsWith('/deliver'));
    expect(JSON.parse(request?.body ?? '{}')).toEqual({
      confirmInstall: true,
      temporarySsh: { username: 'operator', password: 'test-only-password' },
    });
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(
      JSON.stringify(
        client
          .getMutationCache()
          .getAll()
          .map((mutation) => mutation.state.variables),
      ),
    ).not.toContain('test-only-password');
    expect(
      JSON.stringify(
        client
          .getMutationCache()
          .getAll()
          .map((mutation) => mutation.state.variables),
      ),
    ).not.toContain('"confirmInstall":true');
    expect(install.hasAttribute('disabled')).toBe(true);
    // Re-entering credentials enables a new explicit action; it never submits automatically.
    fillCredentials();
    expect(install.hasAttribute('disabled')).toBe(false);
    expect(requests.filter(({ url }) => url.endsWith('/deliver'))).toHaveLength(1);
  });

  it('clears the password when closed externally and reopened', () => {
    const { rerender, view } = mount();
    fillCredentials();
    rerender(view(false));
    rerender(view(true));
    expect(screen.queryByLabelText('Temporary SSH password')).toBeNull();
    fillCredentials();
    expect(screen.getByRole('button', { name: 'Install runtime' }).hasAttribute('disabled')).toBe(false);
    expect(requests.filter(({ url }) => url.endsWith('/deliver'))).toHaveLength(0);
  });

  it('clears the password on the Close button', () => {
    const { rerender, view, onOpenChange } = mount();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(view(false));
    rerender(view(true));
    expect(screen.queryByLabelText('Temporary SSH password')).toBeNull();
    fillCredentials();
    expect(screen.getByRole('button', { name: 'Install runtime' }).hasAttribute('disabled')).toBe(false);
  });
});

it.each([false, true])('requires reviewed identity before confirming a host key (isolated=%s)', async (isolated) => {
  activeSession.state = 'awaiting_identity_confirmation';
  mount();
  const button = screen.getByRole('button', { name: 'Confirm host key' }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Reviewed SSH host-key fingerprint'), { target: { value: 'SHA256:wrong' } });
  expect(button.disabled).toBe(true);
  if (isolated) {
    fireEvent.click(screen.getByRole('button', { name: 'Use this controller' }));
  } else {
    fireEvent.change(screen.getByLabelText('Reviewed SSH host-key fingerprint'), { target: { value: 'SHA256:test' } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
  }
  await waitFor(() => expect(requests.some(({ url }) => url.endsWith('/confirm-host-key'))).toBe(true));
  expect(JSON.parse(requests.find(({ url }) => url.endsWith('/confirm-host-key'))?.body ?? '{}')).toEqual({
    hostKeyFingerprint: 'SHA256:test',
    physicalIdentityConfirmed: isolated,
    trustMethod: isolated ? 'isolated_service_connection' : 'trusted_inventory',
  });
});

it('lets the operator keep enrollment after opening cancellation without sending a revocation', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel enrollment' }));
  expect(
    screen.getByText('Canceling revokes the enrollment credential and deletes this commissioning session.'),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Keep enrollment' }));
  expect(
    screen.queryByText('Canceling revokes the enrollment credential and deletes this commissioning session.'),
  ).toBeNull();
  expect(requests.some(({ url }) => url.endsWith('/cancel'))).toBe(false);
  expect(screen.getByRole('button', { name: 'Cancel enrollment' })).toBeTruthy();
});

it.each(['delivery_failed', 'claim_interrupted'] as const)(
  'switches saved commissioning failures without new requests: %s',
  async (state) => {
    activeSession = { ...session, state, failureReason: 'Commissioning was interrupted.' };
    mount();
    await screen.findAllByText(activeSession.failureReason!);
    await waitFor(() => expect(requests.some(({ url }) => url.endsWith('/settings'))).toBe(true));
    const count = requests.length;
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getAllByText('Die Inbetriebnahme wurde unterbrochen.').length).toBeGreaterThan(0);
    expect(requests).toHaveLength(count);
  },
);
