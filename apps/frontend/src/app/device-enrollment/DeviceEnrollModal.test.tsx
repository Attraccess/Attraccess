import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeviceEnrollmentStore } from '../../stores/deviceEnrollment.store';
import { DeviceEnrollModal, deviceEnrollmentUrl } from './DeviceEnrollModal';

const state = vi.hoisted(() => ({
  approve: vi.fn(),
  isPending: false,
  results: [] as Array<{ data?: unknown; error?: unknown }>,
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

vi.mock('../resourceOverview/toolbar/scanner', () => ({
  ResourceScanner: ({ children }: { children: (open: () => void) => React.ReactNode }) => (
    <>{children(() => undefined)}</>
  ),
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
const typeCode = (code: string) =>
  act(() => fireEvent.change(screen.getByLabelText('Code'), { target: { value: code } }));
const approved = { data: { kind: 'reader', id: 9, name: 'Laser room' } };

beforeEach(() => {
  vi.clearAllMocks();
  state.isPending = false;
  state.results = [];
  useDeviceEnrollmentStore.getState().close();
});
afterEach(cleanup);

describe('DeviceEnrollModal', () => {
  it('points links and QR codes at the app root with the code', () => {
    expect(deviceEnrollmentUrl('K7P-3XQ')).toBe(`${window.location.origin}/?enroll=K7P-3XQ`);
  });

  it('renders nothing until opened', () => {
    mount();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('opens from the button, takes the typed code and an optional name, and offers the new reader', async () => {
    state.results = [approved];
    const { invalidate } = mount();

    act(() => useDeviceEnrollmentStore.getState().open());
    expect(await screen.findByRole('alertdialog', { name: 'Enroll device' })).toBeInTheDocument();

    typeCode('k7p-3xq');
    expect(screen.getByLabelText('Code')).toHaveValue('K7P-3XQ');
    fireEvent.change(screen.getByLabelText('Name (optional)'), { target: { value: 'Laser room' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(state.approve).toHaveBeenCalledWith({ requestBody: { code: 'K7P-3XQ', name: 'Laser room' } });
    expect(await screen.findByRole('alertdialog', { name: 'Device approved' })).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open reader' }));
    await waitFor(() => expect(currentUrl()).toHaveTextContent('/attractap/readers?editReader=9'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('opens with the code from an ?enroll= link and removes it from the URL', async () => {
    mount('/?enroll=K7P-3XQ&tab=x');

    expect(await screen.findByRole('alertdialog', { name: 'Enroll device' })).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toHaveValue('K7P-3XQ');
    expect(currentUrl()).toHaveTextContent('/?tab=x');
  });

  it('waits for sign-in and permission before using a link', async () => {
    const { signIn } = mount('/?enroll=K7P-3XQ', false);

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(currentUrl()).toHaveTextContent('/?enroll=K7P-3XQ');

    signIn();

    expect(await screen.findByRole('alertdialog', { name: 'Enroll device' })).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toHaveValue('K7P-3XQ');
  });

  it.each([
    [404, /No waiting device shows this code/],
    [429, /Too many attempts/],
    [502, /Nothing was created/],
  ])('explains a %i answer and lets the admin try again', async (status, message) => {
    state.results = [{ error: { status, message: 'x', body: {} } }, approved];
    mount();
    act(() => useDeviceEnrollmentStore.getState().open('AAAAAA'));
    await screen.findByRole('alertdialog', { name: 'Enroll device' });

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alertdialog', { name: 'Device approved' })).toBeInTheDocument();
  });

  it('drops the error as soon as the admin edits the code', async () => {
    state.results = [{ error: { status: 404, message: 'x', body: {} } }];
    mount();
    act(() => useDeviceEnrollmentStore.getState().open('AAAAAA'));
    await screen.findByRole('alertdialog', { name: 'Enroll device' });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await screen.findByRole('alert');

    typeCode('BBBBBB');

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the camera button only in secure contexts', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    try {
      Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
      mount();
      act(() => useDeviceEnrollmentStore.getState().open());
      await screen.findByRole('alertdialog', { name: 'Enroll device' });
      expect(screen.queryByRole('button', { name: 'Scan with camera' })).toBeNull();
      cleanup();

      Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
      mount();
      act(() => useDeviceEnrollmentStore.getState().open());
      expect(await screen.findByRole('button', { name: 'Scan with camera' })).toBeInTheDocument();
    } finally {
      if (original) Object.defineProperty(window, 'isSecureContext', original);
    }
  });
});
