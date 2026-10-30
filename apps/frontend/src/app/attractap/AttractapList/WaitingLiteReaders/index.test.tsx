import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WaitingLiteReaders } from './index';

const approve = vi.fn();
let hasPermission = true;
let readers: unknown[] = [];

vi.mock('@attraccess/react-query-client', () => ({
  useDeviceEnrollmentServiceListWaitingLiteReaders: () => ({ data: readers, dataUpdatedAt: Date.now() }),
  useDeviceEnrollmentServiceApproveLiteEnrollment: () => ({ mutate: approve, isPending: false }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => hasPermission }) }));
vi.mock('../../../../hooks/useNow', () => ({ useNow: () => new Date() }));
vi.mock('../../../../utils/apiError', () => ({ getApiErrorMessage: () => 'boom' }));

const reader = {
  pendingId: '7d5f2f2e-6a43-4f0b-9f5e-0d2d1b9a5a11',
  pattern: ['red', 'green', 'blue', 'yellow'],
  rotatesInSeconds: 20,
  firmware: { name: 'attractap_lite', variant: 'ethernet', version: '1.8.1' },
  waitingSince: new Date(Date.now() - 75_000).toISOString(),
  clientAddress: '192.168.1.20',
};

describe('WaitingLiteReaders', () => {
  beforeEach(() => {
    approve.mockReset();
    hasPermission = true;
    readers = [];
  });

  it('renders nothing without the resources.update permission', () => {
    hasPermission = false;
    const { container } = render(<WaitingLiteReaders />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an empty state when no reader waits', () => {
    render(<WaitingLiteReaders />);
    expect(screen.getByText('No Lite readers are waiting for approval.')).toBeInTheDocument();
  });

  it('lists the pattern with colour names, firmware, waiting time and address', () => {
    readers = [reader];
    render(<WaitingLiteReaders />);

    for (const name of ['Red', 'Green', 'Blue', 'Yellow']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getByText('attractap_lite ethernet v1.8.1')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.20')).toBeInTheDocument();
    expect(screen.getByText(/^1:1\d$/)).toBeInTheDocument();
  });

  it('asks for confirmation and approves with the pattern that was shown', () => {
    readers = [reader];
    render(<WaitingLiteReaders />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(approve).not.toHaveBeenCalled();
    expect(screen.getByText(/Look at the reader in front of you/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name (optional)'), { target: { value: ' Laser room ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve reader' }));

    expect(approve).toHaveBeenCalledWith({
      requestBody: { pendingId: reader.pendingId, pattern: reader.pattern, name: 'Laser room' },
    });
  });
});
