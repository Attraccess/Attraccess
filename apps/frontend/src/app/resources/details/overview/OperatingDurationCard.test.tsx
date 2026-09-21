import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatingDurationCard } from './OperatingDurationCard';

const useOperatingDuration = vi.fn();
const canView = vi.fn();
vi.mock('../../operatingDuration', () => ({
  useOperatingDuration: (...args: unknown[]) => useOperatingDuration(...args),
  useCanViewOperatingDuration: () => canView(),
}));
vi.mock('../../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true }) }));

describe('OperatingDurationCard', () => {
  beforeEach(() => {
    canView.mockReturnValue(true);
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
    expect(screen.getAllByText(/No operating interval has been recorded yet/)).toHaveLength(1);
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
    expect(screen.getByText('0:00:00')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/resources/11/flows');
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
    expect(screen.getByText('0:00:30')).toBeInTheDocument();
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
