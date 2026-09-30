import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { operatingTrackingReadiness, OperatingTrackingNotice } from './index';

const hasPermission = vi.fn();
vi.mock('../../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission }) }));

describe('operating tracking readiness', () => {
  it('does not equate historical data with a currently configured source', () => {
    expect(operatingTrackingReadiness(true, false)).toBe('missing');
    expect(operatingTrackingReadiness(false, false)).toBe('missing');
  });

  it('distinguishes configuration from the first recorded interval', () => {
    expect(operatingTrackingReadiness(false, true)).toBe('waiting');
    expect(operatingTrackingReadiness(true, true)).toBe('available');
  });

  it('does not invent configuration state when it cannot be read', () => {
    expect(operatingTrackingReadiness(undefined, undefined)).toBe('unknown');
    expect(operatingTrackingReadiness(false, undefined)).toBe('unavailable');
    expect(operatingTrackingReadiness(true, undefined)).toBe('available');
  });
});

describe('OperatingTrackingNotice', () => {
  beforeEach(() => hasPermission.mockReturnValue(true));

  it('links authorized administrators directly to this resource flows and allows schedule preparation', () => {
    render(<OperatingTrackingNotice resourceId={42} readiness="missing" schedule />);
    expect(screen.getByRole('link', { name: 'Set up operating/idle signals' })).toHaveAttribute(
      'href',
      '/resources/42/flows',
    );
    expect(screen.getByText(/You can save and enable this schedule now/)).toHaveTextContent(
      'including operation outside usage sessions',
    );
  });

  it('explains missing data without offering a forbidden setup route', () => {
    hasPermission.mockReturnValue(false);
    render(<OperatingTrackingNotice resourceId={42} readiness="unavailable" />);
    expect(screen.getByText(/No operating interval has been recorded yet/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(hasPermission).toHaveBeenCalledWith('resources.update');
  });

  it('does not show a missing-source warning for available or unknown data', () => {
    const { rerender } = render(<OperatingTrackingNotice resourceId={42} readiness="available" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    rerender(<OperatingTrackingNotice resourceId={42} readiness="unknown" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
