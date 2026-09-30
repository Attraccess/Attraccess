import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatingDurationCard } from './OperatingDurationCard';

const useOperatingDuration = vi.fn();
const canView = vi.fn();
const canConfigure = vi.fn();
const getDataQuality = vi.fn();
vi.mock('../../operatingDuration', () => ({
  useOperatingDuration: (...args: unknown[]) => useOperatingDuration(...args),
  useCanViewOperatingDuration: () => canView(),
}));
vi.mock('../../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => canConfigure() }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceResourceOperatingDiagnosticsGetDataQuality: (...args: unknown[]) => getDataQuality(...args),
}));

describe('OperatingDurationCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canView.mockReturnValue(true);
    canConfigure.mockReturnValue(true);
    getDataQuality.mockReturnValue({ data: { trackingConfigured: false } });
    useOperatingDuration.mockReturnValue({
      data: {
        sessionDurationMs: 0,
        operatingDurationMs: null,
        unattributedOperatingDurationMs: null,
        operatingDataAvailable: false,
        isOperating: false,
        isProvisional: false,
      },
      isLoading: false,
    });
  });

  it('explains unavailable operating data once, while retaining a real zero session duration', () => {
    render(<OperatingDurationCard resourceId={11} />);
    expect(screen.getAllByText(/Configure operating and idle signals in Flows/)).toHaveLength(1);
    expect(screen.getByText('Tracking not configured')).toBeInTheDocument();
    expect(useOperatingDuration).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
    expect(screen.getByText('0:00:00')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/resources/11/flows');
  });

  it('distinguishes configured signals awaiting their first interval from missing setup', () => {
    getDataQuality.mockReturnValue({ data: { trackingConfigured: true } });
    render(<OperatingDurationCard resourceId={11} />);
    expect(screen.getByText('Waiting for operating signals')).toBeInTheDocument();
    expect(screen.getByText(/check that the signals reach these actions/)).toBeInTheDocument();
    expect(screen.queryByText('Tracking not configured')).not.toBeInTheDocument();
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
  });

  it('keeps generic unavailable guidance for maintenance users without configuration permission', () => {
    canConfigure.mockReturnValue(false);
    // Cached administrative data must not expose a configuration-specific state.
    getDataQuality.mockReturnValue({ data: { trackingConfigured: false } });
    render(<OperatingDurationCard resourceId={11} />);
    expect(screen.getByText('Operating data unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Tracking not configured')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(getDataQuality).toHaveBeenCalledWith({ resourceId: 11 }, undefined, { enabled: false });
  });

  it('retains provisional live values and removes the missing data explanation', () => {
    useOperatingDuration.mockReturnValue({
      data: {
        sessionDurationMs: 60000,
        operatingDurationMs: 30000,
        unattributedOperatingDurationMs: 0,
        operatingDataAvailable: true,
        isOperating: true,
        isProvisional: true,
      },
      isLoading: false,
    });
    render(<OperatingDurationCard resourceId={11} />);
    expect(screen.getByText('Live values are provisional.')).toBeInTheDocument();
    expect(getDataQuality).toHaveBeenCalledWith({ resourceId: 11 }, undefined, { enabled: false });
    expect(screen.getByText('0:00:30')).toBeInTheDocument();
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
