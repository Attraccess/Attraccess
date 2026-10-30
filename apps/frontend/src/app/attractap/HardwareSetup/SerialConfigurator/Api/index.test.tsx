import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttractapSerialConfiguratorApi } from './index';
import { TestWrapper } from '../../../../../test-utils/wrappers';
import type { ApiStatusData } from '../Auth';

// The reader's API status lives in a tiny store so a poll that changes it re-renders the component,
// like the real serial provider does.
const reader = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const store = {
    apiStatus: null as unknown as ApiStatusData,
    set(next: ApiStatusData) {
      store.apiStatus = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return store;
});

const mutation = vi.hoisted(() => ({
  approve: vi.fn(),
  results: [] as Array<{ data?: unknown; error?: unknown }>,
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

type MutationOptions = { onSuccess: (data: unknown) => void; onError: (error: unknown) => void };

vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useDeviceEnrollmentServiceApproveDeviceEnrollment: (options: MutationOptions) => ({
    isPending: false,
    mutate: (variables: unknown) => {
      mutation.approve(variables);
      const next = mutation.results.shift() ?? {};
      if (next.error) options.onError(next.error);
      else options.onSuccess(next.data);
    },
  }),
}));

vi.mock('../../../../../components/toastProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../components/toastProvider')>()),
  useToastMessage: () => toast,
}));

const sendAuthedCommand = vi.fn().mockResolvedValue({});
const fetchConfiguration = vi.fn().mockResolvedValue(undefined);
const refreshApiStatus = vi.fn();

// The browser is currently talking to this server. "Apply current server" must
// push exactly these values to the reader.
vi.mock('../../../../../api', () => ({
  getBaseUrl: () => 'https://server.example.com:8443',
}));

vi.mock('../Auth', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useAttractapSerialComm: () => {
      const apiStatus = useSyncExternalStore(reader.subscribe, () => reader.apiStatus);
      return {
        configuration: { apiStatus },
        fetchConfiguration,
        refreshApiStatus,
        isFetchingConfiguration: false,
        sendAuthedCommand,
      };
    },
  };
});

const disconnected: ApiStatusData = {
  status: 'disconnected',
  hostname: 'old.example.com',
  port: 80,
  deviceId: 'dev-1',
  useSSL: false,
};
const onServer = { hostname: 'server.example.com', port: 8443, deviceId: 'dev-1', useSSL: true };
const pending: ApiStatusData = { ...onServer, status: 'pending_approval', enrollmentCode: 'K7P-3XQ' };

/** Makes the next poll answer with this status, the way the provider merges it. */
function answerPollWith(next: ApiStatusData) {
  refreshApiStatus.mockImplementationOnce(async () => {
    reader.set(next);
    return next;
  });
}

function renderApi() {
  return render(<AttractapSerialConfiguratorApi openDeviceSettings={vi.fn()} />, { wrapper: TestWrapper });
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe('AttractapSerialConfiguratorApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutation.results = [];
    refreshApiStatus.mockReset();
    reader.apiStatus = disconnected;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('applies the current browser server (not an empty payload) when pressing apply', async () => {
    const user = userEvent.setup();
    renderApi();

    await user.click(screen.getByRole('button', { name: 'Apply current server' }));

    expect(sendAuthedCommand).toHaveBeenCalledWith('api.configuration.set', {
      hostname: 'server.example.com',
      port: 8443,
      useSSL: true,
    });
  });

  it('shows the code a waiting reader shows and approves it', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApi();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    unmount();

    reader.apiStatus = pending;
    refreshApiStatus.mockResolvedValue(pending);
    mutation.results = [{ data: { kind: 'reader', id: 3, name: 'Reader 3' } }];
    renderApi();

    expect(screen.getByText('Waiting for approval — K7P-3XQ')).toBeInTheDocument();
    expect(screen.getByText('Press Approve to add this reader to Attraccess.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(mutation.approve).toHaveBeenCalledWith({ requestBody: { code: 'K7P-3XQ' } });
    expect(refreshApiStatus).toHaveBeenCalled();
    expect(fetchConfiguration).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it.each([
    [429, 'Too many attempts. Wait a minute and try again.'],
    [502, 'The device did not confirm. Nothing was created. It will show a new code — enter that one.'],
  ])('explains a failed approval (%i) in words', async (status, description) => {
    const user = userEvent.setup();
    reader.apiStatus = pending;
    refreshApiStatus.mockResolvedValue(pending);
    mutation.results = [{ error: { status, message: 'raw transport message', body: {} } }];
    renderApi();

    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(toast.error).toHaveBeenCalledWith({ title: 'Could not approve the reader', description });
  });

  it('follows the reader from connecting through approval to authenticated, then stops', async () => {
    vi.useFakeTimers();
    reader.apiStatus = { ...onServer, status: 'connecting_tcp' };
    renderApi();
    expect(refreshApiStatus).not.toHaveBeenCalled();

    // The Approve button appears without a manual refresh.
    answerPollWith({ ...pending, enrollmentRotatesInMs: 1000 });
    await advance(3000);
    expect(refreshApiStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();

    // The code is about to rotate, so the next poll comes right after the rotation.
    answerPollWith({ ...pending, enrollmentCode: 'M4N-8RT', enrollmentRotatesInMs: 30000 });
    await advance(1250);
    expect(refreshApiStatus).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Waiting for approval — M4N-8RT')).toBeInTheDocument();

    answerPollWith({ ...onServer, status: 'authenticated' });
    await advance(3000);
    expect(refreshApiStatus).toHaveBeenCalledTimes(3);
    expect(screen.getByText('Connected & authenticated')).toBeInTheDocument();

    await advance(30000);
    expect(refreshApiStatus).toHaveBeenCalledTimes(3);
    expect(fetchConfiguration).not.toHaveBeenCalled();
  });

  it('waits for a slow poll before sending the next one', async () => {
    vi.useFakeTimers();
    reader.apiStatus = pending;
    let answer: (status: ApiStatusData) => void = () => undefined;
    refreshApiStatus.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    renderApi();

    await advance(30000);
    expect(refreshApiStatus).toHaveBeenCalledTimes(1);

    refreshApiStatus.mockResolvedValue(pending);
    await act(async () => answer(pending));
    await advance(3000);
    expect(refreshApiStatus).toHaveBeenCalledTimes(2);
  });

  it('keeps what the user types in the manual form while the status is polled', async () => {
    vi.useFakeTimers();
    const stuck: ApiStatusData = { ...disconnected, status: 'connecting_websocket' };
    reader.apiStatus = stuck;
    refreshApiStatus.mockImplementation(async () => {
      // Every poll yields a new object with the same values, like the provider.
      reader.set({ ...stuck });
      return reader.apiStatus;
    });
    renderApi();

    act(() => fireEvent.click(screen.getByText('Manual server settings')));
    const hostname = screen.getByLabelText('Hostname');
    expect(hostname).toHaveValue('old.example.com');
    act(() => fireEvent.change(hostname, { target: { value: 'typed.example.com' } }));

    await advance(9000);
    expect(refreshApiStatus).toHaveBeenCalled();
    expect(screen.getByLabelText('Hostname')).toHaveValue('typed.example.com');
  });

  it('keeps polling after a failed poll', async () => {
    vi.useFakeTimers();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    reader.apiStatus = { ...onServer, status: 'connected' };
    refreshApiStatus.mockRejectedValueOnce(new Error('NO_RESPONSE')).mockResolvedValue(reader.apiStatus);
    renderApi();

    await advance(3000);
    expect(logged).toHaveBeenCalledWith('Failed to refresh the reader API status', expect.any(Error));
    await advance(3000);
    expect(refreshApiStatus).toHaveBeenCalledTimes(2);
  });

  it.each(['disconnected', 'authenticated', 'error_failed'] as const)(
    'does not poll a reader that is %s',
    async (status) => {
      vi.useFakeTimers();
      reader.apiStatus = { ...onServer, status };
      renderApi();

      await advance(30000);
      expect(refreshApiStatus).not.toHaveBeenCalled();
    },
  );
});
