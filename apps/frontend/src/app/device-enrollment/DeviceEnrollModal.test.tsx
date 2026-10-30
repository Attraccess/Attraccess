import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeviceEnrollmentStore } from '../../stores/deviceEnrollment.store';
import { DeviceEnrollModal } from './DeviceEnrollModal';

const state = vi.hoisted(() => ({
  approve: vi.fn(),
  isPending: false,
  results: [] as Array<{ data?: unknown; error?: unknown }>,
  onDetected: undefined as ((rawValue: string) => boolean) | undefined,
  toast: { success: vi.fn(), error: vi.fn() },
}));

type MutationOptions = { onSuccess: (data: unknown) => void; onError: (error: unknown) => void };

vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useDeviceEnrollmentServiceApproveDeviceEnrollment: (options: MutationOptions) => ({
    isPending: state.isPending,
    mutate: (variables: unknown) => {
      state.approve(variables);
      const next = state.results.shift() ?? {};
      if (next.error) options.onError(next.error);
      else options.onSuccess(next.data);
    },
  }),
}));

vi.mock('../../components/toastProvider', () => ({ useToastMessage: () => state.toast }));

vi.mock('../resourceOverview/toolbar/scanner', () => ({
  ResourceScanner: ({
    children,
    onDetected,
  }: {
    children: (open: () => void) => React.ReactNode;
    onDetected?: (rawValue: string) => boolean;
  }) => {
    state.onDetected = onDetected;
    return <>{children(() => undefined)}</>;
  },
}));

function CurrentUrl() {
  const location = useLocation();
  return <output aria-label="Current URL">{location.pathname + location.search}</output>;
}

function mount(url = '/attractap/readers', canEnroll = true) {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const tree = (allowed: boolean) => (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url]}>
          <DeviceEnrollModal canEnroll={allowed} />
          <CurrentUrl />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>
  );
  const view = render(tree(canEnroll));
  return { invalidate, signIn: () => view.rerender(tree(true)) };
}

const currentUrl = () => screen.getByRole('status', { name: 'Current URL' });
const codeInput = () => screen.getByLabelText('Code');
const approveButton = () => screen.getByRole('button', { name: 'Approve' });
const typeCode = (code: string) => act(() => fireEvent.change(codeInput(), { target: { value: code } }));
const openDialog = async (code?: string) => {
  act(() => useDeviceEnrollmentStore.getState().open(code));
  return screen.findByRole('dialog', { name: 'Enroll device' });
};
const detect = (rawValue: string) => {
  if (!state.onDetected) throw new Error('The dialog did not hand a scan handler to the scanner');
  return state.onDetected(rawValue);
};
const approved = { data: { kind: 'reader', id: 9, name: 'Laser room' } };

beforeEach(() => {
  vi.clearAllMocks();
  state.isPending = false;
  state.results = [];
  state.onDetected = undefined;
  useDeviceEnrollmentStore.getState().close();
});
afterEach(cleanup);

describe('DeviceEnrollModal', () => {
  it('renders nothing until opened', () => {
    mount();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('approves the typed code and optional name, then opens the new reader', async () => {
    state.results = [approved];
    const { invalidate } = mount('/resources');

    await openDialog();
    typeCode('k7p-3xq');
    expect(codeInput()).toHaveValue('K7P-3XQ');
    fireEvent.change(screen.getByLabelText('Name (optional)'), { target: { value: ' Laser room ' } });
    expect(screen.getByLabelText('Name (optional)')).toHaveAttribute('maxlength', '64');
    fireEvent.click(approveButton());

    expect(state.approve).toHaveBeenCalledWith({ requestBody: { code: 'K7P3XQ', name: 'Laser room' } });
    await waitFor(() => expect(currentUrl()).toHaveTextContent('/attractap/readers?editReader=9'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(state.toast.success).toHaveBeenCalledWith({
      title: 'Device approved',
      description: 'Laser room is now registered and connects on its own.',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['AttractapServiceGetReaders'] });
  });

  it('cannot be dismissed with Escape while an approval is in flight', async () => {
    state.isPending = true;
    const user = userEvent.setup();
    mount();
    await openDialog('K7P-3XQ');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Enroll device' })).toBeInTheDocument();
    expect(useDeviceEnrollmentStore.getState().isOpen).toBe(true);
  });

  it('submits with Enter', async () => {
    state.results = [approved];
    const user = userEvent.setup();
    mount();
    await openDialog();

    await user.type(codeInput(), 'K7P3XQ{Enter}');

    expect(state.approve).toHaveBeenCalledWith({ requestBody: { code: 'K7P3XQ' } });
    await waitFor(() => expect(currentUrl()).toHaveTextContent('/attractap/readers?editReader=9'));
  });

  it.each(['', 'K7P3X', 'K7P-3XQ9', 'K7P-3X0', 'I1O-L00'])(
    'keeps Approve disabled for the malformed code %j',
    async (code) => {
      mount();
      await openDialog();
      typeCode(code);

      expect(approveButton()).toBeDisabled();
      fireEvent.submit(codeInput().closest('form') as HTMLFormElement);
      expect(state.approve).not.toHaveBeenCalled();
    },
  );

  it('accepts a code with spaces and lowercase letters', async () => {
    mount();
    await openDialog();
    typeCode(' k7p 3xq ');
    expect(approveButton()).toBeEnabled();
  });

  it('opens with the code from an ?enroll= link and removes it from the URL', async () => {
    mount('/resources?enroll=K7P-3XQ&tab=x');

    expect(await screen.findByRole('dialog', { name: 'Enroll device' })).toBeInTheDocument();
    expect(codeInput()).toHaveValue('K7P-3XQ');
    expect(currentUrl()).toHaveTextContent('/resources?tab=x');
  });

  it('waits for sign-in and permission before using a link', async () => {
    const { signIn } = mount('/?enroll=K7P-3XQ', false);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(currentUrl()).toHaveTextContent('/?enroll=K7P-3XQ');

    signIn();

    expect(await screen.findByRole('dialog', { name: 'Enroll device' })).toBeInTheDocument();
    expect(codeInput()).toHaveValue('K7P-3XQ');
  });

  it.each([
    [404, 'No waiting device shows this code. Check the code and try again.'],
    [429, 'Too many attempts. Wait a minute and try again.'],
    [502, 'The device did not confirm. Nothing was created. It will show a new code — enter that one.'],
    [500, 'Something went wrong: Boom'],
  ])('explains a %i answer and lets the admin try again', async (status, message) => {
    state.results = [{ error: { status, message: 'x', body: { message: 'Boom' } } }, approved];
    mount();
    await openDialog('AAAAAA');

    fireEvent.click(approveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('dialog', { name: 'Enroll device' })).toBeInTheDocument();

    fireEvent.click(approveButton());
    await waitFor(() => expect(currentUrl()).toHaveTextContent('/attractap/readers?editReader=9'));
  });

  it('drops the error as soon as the admin edits the code', async () => {
    state.results = [{ error: { status: 404, message: 'x', body: {} } }];
    mount();
    await openDialog('AAAAAA');
    fireEvent.click(approveButton());
    await screen.findByRole('alert');

    typeCode('BBBBBB');

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['an enroll link', `${window.location.origin}/?enroll=k7p-3xq`],
    ['an enroll link from another address', 'https://attraccess.example.com/?enroll=K7P3XQ'],
    ['a bare code', 'K7P3XQ'],
  ])('fills the code from a scanned QR code holding %s', async (_, rawValue) => {
    const original = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    try {
      mount();
      await openDialog();

      let handled = false;
      act(() => {
        handled = detect(rawValue);
      });

      expect(handled).toBe(true);
      expect(codeInput()).toHaveValue('K7P-3XQ');
      expect(currentUrl()).toHaveTextContent('/attractap/readers');
    } finally {
      restoreSecureContext(original);
    }
  });

  it('rejects scanned QR codes that hold no enrollment code', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    try {
      mount();
      await openDialog();

      for (const rawValue of ['hello', `${window.location.origin}/resources/4`, 'https://x.test/?enroll=nope']) {
        expect(detect(rawValue)).toBe(false);
      }
      expect(codeInput()).toHaveValue('');
    } finally {
      restoreSecureContext(original);
    }
  });

  it('shows the camera button only in secure contexts', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    try {
      Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
      mount();
      await openDialog();
      expect(screen.queryByRole('button', { name: 'Scan with camera' })).toBeNull();
      cleanup();

      Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
      mount();
      await openDialog();
      expect(await screen.findByRole('button', { name: 'Scan with camera' })).toBeInTheDocument();
    } finally {
      restoreSecureContext(original);
    }
  });
});

/** Puts `window.isSecureContext` back, including removing it when the environment had none. */
function restoreSecureContext(original: PropertyDescriptor | undefined) {
  if (original) Object.defineProperty(window, 'isSecureContext', original);
  else delete (window as { isSecureContext?: boolean }).isSecureContext;
}
