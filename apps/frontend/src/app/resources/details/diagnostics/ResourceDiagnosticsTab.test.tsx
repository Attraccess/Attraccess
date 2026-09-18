// Component tests for the operating-timeline diagnostics tab (ATT-1024)
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceDiagnosticsTab } from './ResourceDiagnosticsTab';

const getState = vi.fn();
const getTransitions = vi.fn();
const getUnattributed = vi.fn();
const getDataQuality = vi.fn();
const verifyTimeline = vi.fn();

vi.mock('react-router-dom', () => ({ useParams: () => ({ id: '11' }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceResourceOperatingDiagnosticsGetState: (...args: unknown[]) => getState(...args),
  useResourcesServiceResourceOperatingDiagnosticsGetTransitions: (...args: unknown[]) => getTransitions(...args),
  useResourcesServiceResourceOperatingDiagnosticsGetUnattributed: (...args: unknown[]) => getUnattributed(...args),
  useResourcesServiceResourceOperatingDiagnosticsGetDataQuality: (...args: unknown[]) => getDataQuality(...args),
  useResourcesServiceResourceOperatingDiagnosticsVerifyTimeline: (...args: unknown[]) => verifyTimeline(...args),
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
    getUnattributed.mockReturnValue({
      data: {
        operatingDurationMs: 120 * MINUTE,
        attributedOperatingDurationMs: 90 * MINUTE,
        unattributedOperatingDurationMs: 30 * MINUTE,
        isProvisional: true,
      },
      isLoading: false,
    });
    getDataQuality.mockReturnValue({
      data: {
        trackingConfigured: true,
        issues: [
          { kind: 'stale-signal', count: 1, message: 'No signal recently', intervalIds: [] },
        ],
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

  it('renders the unattributed summary in minutes with a provisional badge', () => {
    render(<ResourceDiagnosticsTab />);

    expect(screen.getByTestId('diagnostics-operating-duration')).toHaveTextContent('2h');
    expect(screen.getByTestId('diagnostics-unattributed-duration')).toHaveTextContent('30m');
    expect(screen.getByText('Provisional (open intervals included)')).toBeInTheDocument();
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
    expect(screen.getByTestId('diagnostics-check-operating-duration-matches')).toHaveTextContent(
      'Operating duration matches the timeline',
    );
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
