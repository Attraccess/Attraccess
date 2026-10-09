import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { ControllerDiagnostics, WagoStatus } from './ControllerDiagnostics';
import { useWagoDiagnostics } from './diagnostics';
import type { WagoDiagnostics } from './diagnostics';

vi.mock('./diagnostics', () => ({ useWagoDiagnostics: vi.fn() }));
vi.mock('@heroui/react', () => {
  const part = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  );
  return {
    Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
    Card: Object.assign(part, { Header: part, Title: part, Description: part, Content: part }),
  };
});

beforeEach(() => useTranslationState.getState().setLanguage('en'));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function fixture(): WagoDiagnostics {
  return {
    controllerId: 1,
    generatedAt: new Date().toISOString(),
    name: 'Controller',
    connectivity: 'online',
    heartbeatAt: new Date().toISOString(),
    heartbeatFreshness: 'fresh',
    runtimeVersion: '1',
    protocolVersion: '1',
    capabilities: [],
    incompatible: false,
    sequenceGaps: 0,
    sequenceExplanation: 'Per category',
    activeStream: 'boot',
    trackingExhausted: false,
    stateConnected: true,
    stateHardwareAvailable: null,
    stateSourceAt: new Date().toISOString(),
    configuration: {
      draftUpdatedAt: null,
      draftChanged: false,
      validationErrorCount: 0,
      validationCodes: [],
      validationErrors: [],
      rejectionErrors: [],
      publishedRevision: 2,
      publishedState: 'applied',
      appliedRevision: 2,
      reportedRevision: 2,
      revisionMismatch: false,
      rejected: false,
    },
    hardwareReadiness: 'unknown',
    hardwareReadinessReason: 'No hardware evidence',
    channels: [],
    faults: [],
    references: [],
    referencesTruncated: false,
    events: [],
    limitations: [],
  };
}

describe('diagnostics isolation', () => {
  it('keeps its surrounding host usable after a diagnostics render failure', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(useWagoDiagnostics, { partial: true }).mockImplementation(() => {
      throw new Error('render failure');
    });
    render(
      <main>
        <button>Host configuration</button>
        <ControllerDiagnostics controllerId={1} />
      </main>,
    );
    expect(screen.getByText('Host configuration')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('could not be displayed');
    error.mockRestore();
  });
  it('reports polling failures without hiding host controls', () => {
    vi.mocked(useWagoDiagnostics, { partial: true }).mockReturnValue({
      isError: true,
      isPending: false,
      dataUpdatedAt: Date.now(),
      data: fixture(),
      refetch: vi.fn(),
    });
    render(<ControllerDiagnostics controllerId={1} onConfigure={() => undefined} />);
    expect(screen.getByText('Open configuration')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Diagnostics unavailable');
    expect(screen.queryByText('Controller: online')).toBeNull();
  });
  it('shows canonical input separately and never promotes unknown hardware readiness', () => {
    const data = fixture();
    data.channels = [
      {
        id: 'door',
        profile: 'input',
        capabilities: ['input'],
        disconnectPolicy: { mode: 'hold' },
        safeState: 'not applicable',
        samples: [
          {
            kind: 'input',
            value: true,
            sourceAt: data.generatedAt,
            receivedAt: data.generatedAt,
            streamId: 'boot',
            sequence: 1,
            sourceFreshness: 'fresh',
            current: true,
            availabilityReason: 'current',
          },
        ],
        current: true,
        fault: null,
        acknowledgement: null,
      },
    ];
    vi.mocked(useWagoDiagnostics, { partial: true }).mockReturnValue({
      isError: false,
      isPending: false,
      data,
      dataUpdatedAt: Date.now(),
      refetch: vi.fn(),
    });
    render(<ControllerDiagnostics controllerId={1} />);
    expect(screen.getByText(/Latest input: true/)).toBeTruthy();
    expect(screen.getByText(/Hardware readiness: unknown/)).toBeTruthy();
    expect(screen.queryByText(/Latest output/)).toBeNull();
  });
  it('hides cached online status when successful polling stalls, without another query update', () => {
    vi.useFakeTimers();
    try {
      const data = fixture();
      vi.mocked(useWagoDiagnostics, { partial: true }).mockReturnValue({
        isError: false,
        isPending: false,
        data,
        dataUpdatedAt: Date.now(),
        refetch: vi.fn(),
      });
      render(<ControllerDiagnostics controllerId={1} />);
      expect(screen.getByText('Controller: online')).toBeTruthy();
      act(() => vi.advanceTimersByTime(16_000));
      expect(screen.queryByText('Controller: online')).toBeNull();
      expect(screen.getByRole('alert').textContent).toContain('refresh is overdue');
    } finally {
      vi.useRealTimers();
    }
  });
  it('accepts polling failure from an embedding host and suppresses the cached status', () => {
    render(<WagoStatus diagnostics={fixture()} pollingFailed />);
    expect(screen.queryByText('Controller: online')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('status is unknown');
  });
  it('uses local receipt time rather than the server-generated timestamp for polling freshness', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-05T12:00:00Z'));
    try {
      const data = fixture();
      data.generatedAt = '2026-09-05T12:01:00Z';
      vi.mocked(useWagoDiagnostics, { partial: true }).mockReturnValue({
        isError: false,
        isPending: false,
        data,
        dataUpdatedAt: Date.now(),
        refetch: vi.fn(),
      });
      render(<ControllerDiagnostics controllerId={1} />);
      expect(screen.getByText('Controller: online')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
