// Component tests for the operating-timeline diagnostics tab (ATT-1024)
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceDiagnosticsTab } from './ResourceDiagnosticsTab';

const getState = vi.fn();
const getTransitions = vi.fn();
const getDataQuality = vi.fn();
const verifyTimeline = vi.fn();
const useOperatingDurationMock = vi.fn();

vi.mock('../../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true }) }));

vi.mock('react-router-dom', () => ({ useParams: () => ({ id: '11' }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceResourceOperatingDiagnosticsGetState: (...args: unknown[]) => getState(...args),
  useResourcesServiceResourceOperatingDiagnosticsGetTransitions: (...args: unknown[]) => getTransitions(...args),
  useResourcesServiceResourceOperatingDiagnosticsGetDataQuality: (...args: unknown[]) => getDataQuality(...args),
  useResourcesServiceResourceOperatingDiagnosticsVerifyTimeline: (...args: unknown[]) => verifyTimeline(...args),
}));
vi.mock('../../operatingDuration', () => ({
  useOperatingDuration: (...args: unknown[]) => useOperatingDurationMock(...args),
}));

const MINUTE = 60_000;

describe('ResourceDiagnosticsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getState.mockReturnValue({
      data: {
        state: 'operating',
        openInterval: { id: 5, startTime: '2026-09-18T08:00:00.000Z' },
        lastTransitionAt: '2026-09-18T08:00:00.000Z',
      },
      isLoading: false,
    });
    getTransitions.mockReturnValue({
      data: {
        items: [
          { timestamp: '2026-09-18T08:00:00.000Z', state: 'operating', intervalId: 5, source: 'flow-signal' },
          { timestamp: '2026-09-17T16:00:00.000Z', state: 'idle', intervalId: 4, source: 'flow-signal' },
        ],
        totalIntervals: 25,
        page: 1,
        limit: 10,
      },
      isLoading: false,
    });
    useOperatingDurationMock.mockReturnValue({
      data: {
        sessionDurationMs: 100 * MINUTE,
        operatingDataAvailable: true,
        operatingDurationMs: 120 * MINUTE,
        unattributedOperatingDurationMs: 30 * MINUTE,
        isOperating: true,
        isProvisional: true,
        attributions: [],
      },
      isLoading: false,
    });
    getDataQuality.mockReturnValue({
      data: {
        trackingConfigured: true,
        issues: [{ kind: 'stale-signal', count: 1, message: 'No signal recently', intervalIds: [] }],
      },
      isLoading: false,
    });
    verifyTimeline.mockReturnValue({ data: undefined, isFetching: false, refetch: vi.fn() });
  });

  it('renders the current operating state', () => {
    render(<ResourceDiagnosticsTab />);

    expect(screen.getByTestId('diagnostics-state-chip')).toHaveTextContent('Operating');
    expect(getState).toHaveBeenCalledWith({ resourceId: 11 });
  });

  it('renders data-quality issues as warnings', () => {
    render(<ResourceDiagnosticsTab />);

    expect(screen.getByTestId('diagnostics-issue-stale-signal')).toBeInTheDocument();
    expect(screen.getByText('No signal recently')).toBeInTheDocument();
  });

  it('renders the shared unattributed summary with the shared duration formatter', () => {
    render(<ResourceDiagnosticsTab />);

    // The summary comes from the shared operating-attribution endpoint (single derivation path).
    expect(useOperatingDurationMock).toHaveBeenCalledWith(
      11,
      true,
      expect.objectContaining({ start: expect.any(Date), end: expect.any(Date) }),
    );
    expect(screen.getByTestId('diagnostics-operating-duration')).toHaveTextContent('2:00:00');
    expect(screen.getByTestId('diagnostics-attributed-duration')).toHaveTextContent('1:30:00');
    expect(screen.getByTestId('diagnostics-unattributed-duration')).toHaveTextContent('0:30:00');
    expect(screen.getByText('Provisional (open intervals included)')).toBeInTheDocument();
  });

  it('shows unavailable instead of zero when the resource never produced operating data', () => {
    useOperatingDurationMock.mockReturnValue({
      data: {
        sessionDurationMs: 60 * MINUTE,
        operatingDataAvailable: false,
        operatingDurationMs: null,
        unattributedOperatingDurationMs: null,
        isOperating: false,
        isProvisional: false,
        attributions: [],
      },
      isLoading: false,
    });
    render(<ResourceDiagnosticsTab />);

    expect(screen.getByTestId('diagnostics-unattributed-unavailable')).toHaveTextContent(
      'No operating data has ever been recorded for this resource — durations are unavailable, not zero.',
    );
    expect(screen.queryByTestId('diagnostics-operating-duration')).not.toBeInTheDocument();
  });

  it('offers authorized administrators a direct setup action when tracking is missing', () => {
    getDataQuality.mockReturnValue({ data: { trackingConfigured: false, issues: [] }, isLoading: false });
    render(<ResourceDiagnosticsTab />);
    expect(screen.getByRole('link', { name: 'Set up operating/idle signals' })).toHaveAttribute(
      'href',
      '/resources/11/flows',
    );
    expect(screen.getByText(/Configure operating and idle signals in Flows/)).toBeInTheDocument();
  });

  it('renders the derived transition history', () => {
    render(<ResourceDiagnosticsTab />);

    const table = screen.getByTestId('diagnostics-transitions');
    expect(table).toHaveTextContent('Flow signal');
    expect(table).toHaveTextContent('#5');
    expect(table).toHaveTextContent('#4');
    expect(screen.getByText('Page 1/3 · 25 intervals')).toBeInTheDocument();
  });

  it('runs timeline verification on demand and shows the result', async () => {
    const refetch = vi.fn();
    verifyTimeline.mockReturnValue({
      data: {
        consistent: true,
        recomputedOperatingDurationMs: 120 * MINUTE,
        operatingDataAvailable: true,
        reportedOperatingDurationMs: 120 * MINUTE,
        intervalCount: 4,
        checks: [
          { name: 'operating-duration-matches', passed: true, detail: null },
          { name: 'attribution-partition-matches', passed: true, detail: null },
          { name: 'attributions-within-operating-duration', passed: true, detail: null },
        ],
      },
      isFetching: false,
      refetch,
    });
    render(<ResourceDiagnosticsTab />);

    await userEvent.click(screen.getByTestId('diagnostics-run-verification'));

    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(screen.getByText('Timeline consistent')).toBeInTheDocument();
    expect(screen.getByTestId('diagnostics-verification')).toHaveTextContent('2:00:00');
    expect(screen.getByTestId('diagnostics-check-operating-duration-matches')).toHaveTextContent(
      'Operating duration matches the timeline',
    );
  });

  it('renders a null reported duration as unavailable, not as zero', () => {
    verifyTimeline.mockReturnValue({
      data: {
        consistent: true,
        recomputedOperatingDurationMs: 0,
        operatingDataAvailable: false,
        reportedOperatingDurationMs: null,
        intervalCount: 0,
        checks: [{ name: 'operating-duration-matches', passed: true, detail: null }],
      },
      isFetching: false,
      refetch: vi.fn(),
    });
    render(<ResourceDiagnosticsTab />);

    expect(screen.getByTestId('diagnostics-verification')).toHaveTextContent('unavailable');
  });

  it('does not run verification before the operator asks for it', () => {
    render(<ResourceDiagnosticsTab />);

    expect(verifyTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 11 }),
      undefined,
      expect.objectContaining({ enabled: false }),
    );
  });
});
