import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WaitingLiteReaders } from './index';

const approve = vi.fn();
const invalidateQueries = vi.fn();
let mutationOptions: { onSuccess?: (result: unknown) => void; onError?: (error: unknown) => void } = {};
let permissions: string[] = ['resources.update'];
let readers: unknown[] = [];
let loadFailed = false;

const FETCHED_AT = new Date('2026-10-30T10:00:00.000Z').getTime();

vi.mock('@attraccess/react-query-client', () => ({
  useDeviceEnrollmentServiceListWaitingLiteReadersKey: 'DeviceEnrollmentServiceListWaitingLiteReaders',
  useDeviceEnrollmentServiceListWaitingLiteReaders: () => ({
    data: readers,
    dataUpdatedAt: FETCHED_AT,
    isError: loadFailed,
  }),
  useDeviceEnrollmentServiceApproveLiteEnrollment: (options: typeof mutationOptions) => {
    mutationOptions = options;
    return { mutate: approve, isPending: false };
  },
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => permissions.includes(permission) }),
}));
vi.mock('../../../../utils/apiError', () => ({ getApiErrorMessage: () => 'boom' }));

const reader = {
  pendingId: '7d5f2f2e-6a43-4f0b-9f5e-0d2d1b9a5a11',
  pattern: ['red', 'green', 'blue', 'yellow'],
  rotatesInSeconds: 20,
  firmware: { name: 'attractap_lite', variant: 'ethernet', version: '1.8.1' },
  waitingSince: new Date(FETCHED_AT - 75_000).toISOString(),
  clientAddress: '192.168.1.20',
};

function openAndConfirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  fireEvent.click(screen.getByRole('button', { name: 'Approve reader' }));
}

describe('WaitingLiteReaders', () => {
  beforeEach(() => {
    approve.mockReset();
    invalidateQueries.mockReset();
    mutationOptions = {};
    permissions = ['resources.update'];
    readers = [];
    loadFailed = false;
    // The real useNow ticks with setInterval; only the clock is faked so React's scheduling keeps working.
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(FETCHED_AT);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Lets the clock tick, which re-renders the card like it does every second in the app. */
  function tick(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  it('renders nothing without the resources.update permission', () => {
    permissions = ['resources.read'];
    const { container } = render(<WaitingLiteReaders />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an empty state when no reader waits', () => {
    render(<WaitingLiteReaders />);
    expect(screen.getByText('No Lite readers are waiting for approval.')).toBeInTheDocument();
  });

  it('says so when the list could not be loaded instead of claiming nobody waits', () => {
    loadFailed = true;
    render(<WaitingLiteReaders />);
    expect(screen.getByText(/could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText('No Lite readers are waiting for approval.')).not.toBeInTheDocument();
  });

  it('lists the pattern in ring order with colour names, firmware, waiting time and address', () => {
    readers = [reader];
    render(<WaitingLiteReaders />);

    const list = document.querySelector('[data-cy="lite-pattern"]') as HTMLElement;
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Red', 'Green', 'Blue', 'Yellow']);
    expect(screen.getByText(/attractap_lite \(ethernet\)/)).toBeInTheDocument();
    expect(screen.getByText('v1.8.1')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.20')).toBeInTheDocument();
    expect(screen.getByText('1:15')).toBeInTheDocument();
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

  it('keeps the pattern the admin saw even when a poll brings a new one while the dialog is open', () => {
    readers = [reader];
    render(<WaitingLiteReaders />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    readers = [{ ...reader, pattern: ['white', 'magenta', 'white', 'magenta'] }];
    tick(1000);
    expect(screen.getAllByText('Magenta').length).toBeGreaterThan(0); // the row shows the new pattern
    fireEvent.click(screen.getByRole('button', { name: 'Approve reader' }));

    expect(approve).toHaveBeenCalledWith({ requestBody: { pendingId: reader.pendingId, pattern: reader.pattern } });
  });

  it('sends the approval once when the confirm button is pressed twice in a row', () => {
    readers = [reader];
    render(<WaitingLiteReaders />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const confirm = screen.getByRole('button', { name: 'Approve reader' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(approve).toHaveBeenCalledTimes(1);
  });

  it.each([
    [404, /pattern on the reader changed/],
    [429, /Too many attempts/],
    [502, /did not answer/],
    [500, /Something went wrong: boom/],
  ])('closes the confirmation on a %s and shows why, so a stale pattern is not resent', (status, message) => {
    readers = [reader];
    render(<WaitingLiteReaders />);
    openAndConfirm();

    act(() => mutationOptions.onError?.({ status }));

    expect(screen.queryByRole('button', { name: 'Approve reader' })).not.toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['DeviceEnrollmentServiceListWaitingLiteReaders'] });
  });

  it('shows the approved reader and frees the button for the next one', () => {
    readers = [reader, { ...reader, pendingId: '2b0c8a4e-1f7d-4b3e-9a51-6c2d8e0f4a77' }];
    render(<WaitingLiteReaders />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Approve reader' }));

    act(() => mutationOptions.onSuccess?.({ kind: 'reader', id: 12, name: 'Laser room' }));

    expect(screen.queryByRole('button', { name: 'Approve reader' })).not.toBeInTheDocument();
    expect(screen.getByText('Laser room is now registered and connects on its own.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open reader' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Approve reader' }));
    expect(approve).toHaveBeenCalledTimes(2);
  });

  it('allows a new attempt from the refreshed row after a failure', () => {
    readers = [reader];
    render(<WaitingLiteReaders />);
    openAndConfirm();
    act(() => mutationOptions.onError?.({ status: 404 }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    openAndConfirm();
    expect(approve).toHaveBeenCalledTimes(2);
  });

  it('counts down every second between polls and never above what the server reported', () => {
    readers = [reader];
    vi.setSystemTime(FETCHED_AT - 1500); // the clock tick that renders the row is older than the poll that delivered it
    render(<WaitingLiteReaders />);
    expect(screen.getByText('20 s')).toBeInTheDocument();
    expect(screen.getByText('1:13')).toBeInTheDocument();

    tick(4000); // four ticks: the clock is now 2.5 s past the poll
    expect(screen.getByText('18 s')).toBeInTheDocument();
    expect(screen.getByText('1:17')).toBeInTheDocument();
  });
});
