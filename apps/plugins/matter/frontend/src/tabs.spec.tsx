// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FabricBackupStatus } from './fabric-backup/api';
import { HEALTH_POLL_MS } from './tabs/HealthTab';
import { node, status } from './test-utils/fixtures';
import { ALL_KEYS, renderMatter, signIn } from './test-utils/renderMatter';

const api = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getStatus: vi.fn(),
  saveSettings: vi.fn(),
  removeSettings: vi.fn(),
  reconnect: vi.fn(),
}));
const devices = vi.hoisted(() => ({ listNodes: vi.fn(), getReconciliation: vi.fn() }));
const fabric = vi.hoisted(() => ({ getFabricStatus: vi.fn() }));
vi.mock('./api', () => api);
vi.mock('./devices/api', async (original) => ({ ...(await original<typeof import('./devices/api')>()), ...devices }));
vi.mock('./fabric-backup/api', () => fabric);
vi.mock('./fabric-backup/FabricBackupSection', () => ({
  FabricBackupSection: () => <div data-cy="fabric-section-stub" />,
}));

configure({ testIdAttribute: 'data-cy' });

const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const DAY = 24 * 60 * 60 * 1000;
const facts = { fabricId: '1', rootCertFingerprint: 'aa', fabricGeneration: 1, storageInstanceId: 's' };

function fabricStatus(overrides: Partial<FabricBackupStatus> = {}): FabricBackupStatus {
  return {
    sidecar: { ...facts, reachable: true, state: 'initialized', reason: null },
    recorded: facts,
    recovery: { required: false, mismatch: null },
    recoveryKey: { present: true, keyId: 'k', createdAt: iso(DAY), acknowledged: true },
    backups: {
      lastSuccessfulAt: iso(DAY / 2),
      lastAttempt: { at: iso(DAY / 2), outcome: 'succeeded', trigger: 'daily', reason: null },
      nextScheduledAt: null,
      retention: 7,
      stored: [],
    },
    actions: { canCreateFabric: false, canBackup: true, canRestore: true, canAcceptSidecar: false, canStartNew: false },
    ...overrides,
  };
}

const where = () => screen.getByTestId('location');

beforeEach(() => {
  signIn(...ALL_KEYS);
  api.getStatus.mockResolvedValue(status());
  api.getSettings.mockResolvedValue(null);
  devices.listNodes.mockResolvedValue([]);
  devices.getReconciliation.mockResolvedValue({
    lastStartedAt: iso(60_000),
    lastFinishedAt: iso(30_000),
    lastResult: 'applied',
    lastSummary: { changeCount: 1, nodesListed: 2 },
    sidecarFabricId: '1',
    events: { applied: 4, dropped: 0, outOfOrder: 2 },
  });
  fabric.getFabricStatus.mockResolvedValue(fabricStatus());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Thread Network', () => {
  it('says Thread is not set up and why, from what the sidecar reports', async () => {
    renderMatter('/matter/thread');
    const empty = await screen.findByTestId('matter-thread-empty');
    expect(empty).toHaveTextContent('Thread is not set up');
    await waitFor(() =>
      expect(within(empty).getByTestId('matter-family-notice-thread')).toHaveTextContent(
        /does not report "Thread" as available/,
      ),
    );
  });

  it('says it is unknown while the sidecar is not connected', async () => {
    api.getStatus.mockResolvedValue(status({ state: 'degraded', reason: 'unavailable', capabilities: null }));
    renderMatter('/matter/thread');
    await waitFor(() =>
      expect(screen.getByTestId('matter-family-notice-thread')).toHaveTextContent(
        /sidecar is not connected, so its "Thread" support is unknown/,
      ),
    );
  });

  it('says a later plugin version brings it when the sidecar already supports it', async () => {
    api.getStatus.mockResolvedValue(
      status({ capabilities: { capabilities: [{ family: 'thread', available: true }] } }),
    );
    renderMatter('/matter/thread');
    await waitFor(() =>
      expect(screen.getByTestId('matter-family-notice-thread')).toHaveTextContent(
        /supports "Thread", but this plugin version does not use it yet/,
      ),
    );
  });

  it('gives coexistence guidance with a docs link and a placeholder for each section, without inputs', async () => {
    renderMatter('/matter/thread');
    expect(await screen.findByTestId('matter-thread-coexistence')).toHaveTextContent(/Zigbee and Thread on 2\.4 GHz/);
    expect(screen.getByTestId('matter-thread-docs')).toBeInTheDocument();
    for (const section of ['dataset', 'borderRouters', 'rcps', 'smlight']) {
      expect(screen.getByTestId(`matter-thread-${section}`)).toBeInTheDocument();
    }
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('links the docs in a new tab', async () => {
    renderMatter('/matter/thread');
    const link = await screen.findByRole('link', { name: /Read the documentation/ });
    expect(link).toHaveAttribute('href', 'https://docs.attraccess.org/#/en/plugins/matter/admin-ui');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('data-cy', 'matter-thread-docs');
  });
});

describe('Commissioning', () => {
  it('explains the steps and is not available yet, without any input that pretends to work', async () => {
    renderMatter('/matter/commissioning');
    const tab = await screen.findByTestId('matter-commissioning-tab');
    expect(within(tab).getByTestId('matter-commissioning-empty')).toHaveTextContent(
      'Commissioning is not available yet',
    );
    const steps = within(tab).getByTestId('matter-commissioning-steps');
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((step) => step.textContent),
    ).toEqual([
      expect.stringContaining('Prepare the device'),
      expect.stringContaining('Enter or scan the code'),
      expect.stringContaining('Watch the progress'),
      expect.stringContaining('Name and claim'),
    ]);
    expect(within(tab).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(tab).queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('matter-family-notice-commissioning')).toHaveTextContent(
        /does not report "Commissioning"/,
      ),
    );
  });

  it('is only reachable with the commission permission', async () => {
    signIn('matter.devices.read', 'matter.devices.manage');
    renderMatter('/matter/commissioning');
    await waitFor(() => expect(where()).toHaveTextContent('/matter/devices'));
    expect(screen.queryByTestId('matter-commissioning-tab')).not.toBeInTheDocument();
  });
});

describe('Software Updates', () => {
  it('lists the current software of every device and says update discovery comes with OTA', async () => {
    devices.listNodes.mockResolvedValue([
      node('node-1', { metadata: { displayName: 'Lamp', description: null, location: null } }),
      node('node-2', {
        lifecycleState: 'unclaimed',
        identity: { ...node('node-2').identity, softwareVersionString: null, softwareVersion: 9 },
      }),
      node('node-3', { lifecycleState: 'archived' }),
    ]);
    renderMatter('/matter/updates');
    expect(await screen.findByTestId('matter-updates-empty')).toHaveTextContent(
      'Update discovery is not available yet',
    );
    const rows = await screen.findAllByTestId('matter-software-row');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/Lamp.*1\.0\.3.*Hardware 2/),
      expect.stringMatching(/Plug \(2\).*9/),
    ]);
    expect(screen.getByTestId('matter-family-notice-ota')).toBeInTheDocument();
    // No approve or apply control until OTA exists.
    expect(screen.queryByRole('button', { name: /approve|apply|update now/i })).not.toBeInTheDocument();
  });

  it('has its own error and empty states', async () => {
    devices.listNodes.mockRejectedValue(new Error('down'));
    renderMatter('/matter/updates');
    expect(await screen.findByTestId('matter-software-error')).toHaveTextContent('down');
    expect(screen.getByTestId('matter-updates-empty')).toBeInTheDocument();
  });
});

describe('Health', () => {
  it('shows a healthy installation without fix links', async () => {
    renderMatter('/matter/health');
    await screen.findByTestId('matter-health-tab');
    await waitFor(() => expect(screen.getByTestId('matter-health-connection')).toHaveAttribute('data-level', 'ok'));
    await waitFor(() => expect(screen.getByTestId('matter-health-fabric')).toHaveAttribute('data-level', 'ok'));
    expect(screen.getByTestId('matter-health-backup')).toHaveAttribute('data-level', 'ok');
    expect(screen.getByTestId('matter-health-compatibility')).toHaveAttribute('data-level', 'ok');
    expect(screen.getByTestId('matter-health-reconciliation')).toHaveAttribute('data-level', 'ok');
    expect(screen.getByTestId('matter-health-versions')).toHaveTextContent(
      'Sidecar 0.4.0-alpha.0, matter.js 0.18.0, wire version 1.',
    );
    expect(screen.queryByTestId('matter-health-connection-fix')).not.toBeInTheDocument();
  });

  it.each([
    ['unauthorized', 'danger'],
    ['incompatible', 'danger'],
    ['misconfigured', 'danger'],
  ] as const)('rates %s as %s, like the banner and the status card', async (reason, level) => {
    api.getStatus.mockResolvedValue(status({ state: 'degraded', reason }));
    renderMatter('/matter/health');
    const card = await screen.findByTestId('matter-health-connection');
    await waitFor(() => expect(card).toHaveAttribute('data-level', level));
    expect(screen.getByTestId('matter-degraded-banner')).toBeInTheDocument();
  });

  it('shows a spinner, and no level or fix link, while a card loads', async () => {
    fabric.getFabricStatus.mockReturnValue(new Promise(() => undefined));
    devices.getReconciliation.mockReturnValue(new Promise(() => undefined));
    renderMatter('/matter/health');
    for (const card of ['matter-health-fabric', 'matter-health-backup', 'matter-health-reconciliation']) {
      const element = await screen.findByTestId(card);
      expect(element).toHaveAttribute('data-level', 'loading');
      expect(within(element).getByTestId(`${card}-loading`)).toBeInTheDocument();
      expect(within(element).queryByTestId(`${card}-level`)).not.toBeInTheDocument();
      expect(within(element).queryByTestId(`${card}-fix`)).not.toBeInTheDocument();
    }
  });

  it('says "unknown", not "no reconciliation yet", when the reconciliation status cannot be loaded', async () => {
    devices.getReconciliation.mockRejectedValue(new Error('Request failed (HTTP 500).'));
    renderMatter('/matter/health');
    expect(await screen.findByTestId('matter-health-reconciliation-error')).toBeInTheDocument();
    expect(screen.getByTestId('matter-health-reconciliation-level')).toHaveTextContent('Unknown');
  });

  it('refreshes fabric, backup and reconciliation every 30 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderMatter('/matter/health');
      await waitFor(() =>
        expect(screen.getByTestId('matter-health-reconciliation')).toHaveAttribute('data-level', 'ok'),
      );
      const fabricCalls = fabric.getFabricStatus.mock.calls.length;
      const reconciliationCalls = devices.getReconciliation.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS);
      });
      expect(fabric.getFabricStatus.mock.calls.length).toBe(fabricCalls + 1);
      expect(devices.getReconciliation.mock.calls.length).toBe(reconciliationCalls + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the connection details of a degraded sidecar and links to where it is fixed', async () => {
    const user = userEvent.setup();
    api.getStatus.mockResolvedValue(
      status({
        state: 'degraded',
        reason: 'unavailable',
        nextRetryAt: iso(-60_000),
        lastError: { code: 'sidecar_unavailable', message: 'x', correlationId: 'corr-1' },
      }),
    );
    renderMatter('/matter/health');
    const card = await screen.findByTestId('matter-health-connection');
    // `unavailable` usually heals by itself: a warning here, as in the banner and on Infrastructure.
    await waitFor(() => expect(card).toHaveAttribute('data-level', 'warning'));
    expect(within(card).getByTestId('matter-health-last-error')).toHaveTextContent('sidecar_unavailable');
    expect(within(card).getByTestId('matter-health-last-error')).toHaveTextContent('corr-1');
    expect(within(card).getByTestId('matter-health-next-retry')).toBeInTheDocument();
    await user.click(within(card).getByTestId('matter-health-connection-fix'));
    expect(where()).toHaveTextContent('/matter/infrastructure');
  });

  it('labels versions as last known while the sidecar is not connected, and flags an incompatible one', async () => {
    api.getStatus.mockResolvedValue(status({ state: 'degraded', reason: 'incompatible' }));
    renderMatter('/matter/health');
    await waitFor(() =>
      expect(screen.getByTestId('matter-health-compatibility')).toHaveAttribute('data-level', 'danger'),
    );
    expect(screen.getByTestId('matter-health-versions')).toHaveTextContent(/^Last known:/);
  });

  it.each([
    [{ recovery: { required: true, mismatch: 'fabric_changed' as const } }, 'danger', 'Recovery needed'],
    [
      { sidecar: { ...facts, reachable: false, state: 'unknown' as const, reason: 'x' } },
      'unknown',
      'Sidecar unreachable',
    ],
    [
      { sidecar: { ...facts, reachable: true, state: 'uninitialized' as const, reason: null } },
      'warning',
      'No fabric yet',
    ],
  ])('summarizes the fabric (%#)', async (override, level, label) => {
    fabric.getFabricStatus.mockResolvedValue(fabricStatus(override));
    renderMatter('/matter/health');
    const card = await screen.findByTestId('matter-health-fabric');
    await waitFor(() => expect(card).toHaveAttribute('data-level', level));
    expect(within(card).getByTestId('matter-health-fabric-level')).toHaveTextContent(label);
    if (level !== 'ok') expect(within(card).getByTestId('matter-health-fabric-fix')).toBeInTheDocument();
  });

  it.each([
    [{ lastSuccessfulAt: null, lastAttempt: null }, 'warning', 'No backup yet'],
    [{ lastSuccessfulAt: iso(3 * DAY) }, 'warning', 'Backup overdue'],
    [
      { lastAttempt: { at: iso(1000), outcome: 'failed' as const, trigger: 'daily' as const, reason: 'disk' } },
      'warning',
      'Last backup failed',
    ],
  ])('summarizes the backup (%#)', async (override, level, label) => {
    fabric.getFabricStatus.mockResolvedValue(fabricStatus({ backups: { ...fabricStatus().backups, ...override } }));
    renderMatter('/matter/health');
    const card = await screen.findByTestId('matter-health-backup');
    await waitFor(() => expect(card).toHaveAttribute('data-level', level));
    expect(within(card).getByTestId('matter-health-backup-level')).toHaveTextContent(label);
    expect(within(card).getByTestId('matter-health-backup-fix')).toBeInTheDocument();
  });

  it('shows the age of the last backup', async () => {
    fabric.getFabricStatus.mockResolvedValue(
      fabricStatus({ backups: { ...fabricStatus().backups, lastSuccessfulAt: iso(1.2 * DAY) } }),
    );
    renderMatter('/matter/health');
    expect(await screen.findByTestId('matter-health-backup-last')).toHaveTextContent('(1 day ago)');
  });

  it('shows reconciliation status and event counters, and links to Devices when it failed', async () => {
    devices.getReconciliation.mockResolvedValue({
      lastStartedAt: null,
      lastFinishedAt: iso(1000),
      lastResult: 'failed',
      lastSummary: null,
      sidecarFabricId: null,
      events: { applied: 4, outOfOrder: 2, dropped: 0 },
    });
    renderMatter('/matter/health');
    const card = await screen.findByTestId('matter-health-reconciliation');
    await waitFor(() => expect(card).toHaveAttribute('data-level', 'danger'));
    expect(within(card).getByTestId('matter-health-events')).toHaveTextContent('applied: 4 · out of order: 2');
    expect(within(card).getByTestId('matter-health-reconciliation-fix')).toHaveTextContent('Open Devices');
  });

  it('shows which feature families the sidecar reports', async () => {
    renderMatter('/matter/health');
    await waitFor(() =>
      expect(screen.getByTestId('matter-capability-inventory')).toHaveAttribute('data-availability', 'available'),
    );
    expect(screen.getByTestId('matter-capability-thread')).toHaveAttribute('data-availability', 'unavailable');
    expect(screen.getByTestId('matter-capability-ota')).toHaveTextContent('Updates (OTA): not available');
  });

  it('shows errors of one card without blanking the others', async () => {
    fabric.getFabricStatus.mockRejectedValue(new Error('fabric down'));
    devices.getReconciliation.mockRejectedValue(new Error('recon down'));
    renderMatter('/matter/health');
    expect(await screen.findByTestId('matter-health-fabric-error')).toHaveTextContent('fabric down');
    expect(screen.getByTestId('matter-health-backup-error')).toHaveTextContent('fabric down');
    expect(await screen.findByTestId('matter-health-reconciliation-error')).toHaveTextContent('recon down');
    await waitFor(() => expect(screen.getByTestId('matter-health-connection')).toHaveAttribute('data-level', 'ok'));
  });

  it('shows the Thread card, and only it, to a Thread-only user', async () => {
    signIn('thread.network.read');
    const user = userEvent.setup();
    renderMatter('/matter/health');
    const card = await screen.findByTestId('matter-health-thread');
    expect(card).toHaveTextContent('Thread health');
    await user.click(within(card).getByTestId('matter-health-thread-fix'));
    expect(where()).toHaveTextContent('/matter/thread');
  });

  it('shows a Matter-only user no Thread section', async () => {
    signIn('matter.devices.read');
    renderMatter('/matter/health');
    await screen.findByTestId('matter-health-connection');
    expect(screen.queryByTestId('matter-health-thread')).not.toBeInTheDocument();
  });
});

describe('Infrastructure', () => {
  it('holds the status card, the settings form (manage) and the fabric section, and shows no secret', async () => {
    api.getSettings.mockResolvedValue({
      url: 'https://matter.example.com',
      credentialConfigured: true,
      credentialUpdatedAt: iso(DAY),
      caCertificate: null,
      updatedAt: iso(DAY),
    });
    renderMatter('/matter/infrastructure');
    expect(await screen.findByTestId('matter-status-card')).toBeInTheDocument();
    expect(await screen.findByTestId('matter-settings')).toBeInTheDocument();
    expect(screen.getByTestId('fabric-section-stub')).toBeInTheDocument();
    expect(screen.getByTestId('matter-credential-configured')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Token/)).not.toBeInTheDocument();
  });

  it('labels the versions of an unavailable sidecar as last known', async () => {
    api.getStatus.mockResolvedValue(status({ state: 'degraded', reason: 'unavailable' }));
    renderMatter('/matter/infrastructure');
    expect(await screen.findByTestId('matter-sidecar-version')).toHaveTextContent('Sidecar (last known)');
    expect(screen.getByTestId('matter-matterjs-version')).toHaveTextContent('matter.js (last known)');
    expect(screen.getByTestId('matter-wire-version')).toHaveTextContent('Wire version (last known)');
  });

  it('labels the versions plainly while connected', async () => {
    renderMatter('/matter/infrastructure');
    expect(await screen.findByTestId('matter-sidecar-version')).not.toHaveTextContent('last known');
  });
});
