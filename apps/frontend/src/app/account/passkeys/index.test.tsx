import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PasskeysCard } from './index';
const state = vi.hoisted(() => ({
  supported: true,
  loading: false,
  keys: [] as { id: number; name: string; lastUsedAt?: string }[],
  getOptions: vi.fn(),
  register: vi.fn(),
  verify: vi.fn(),
  remove: vi.fn(),
  refetch: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({
    t: (key: string, params?: { name?: string }) => (params?.name ? `${key}:${params.name}` : key),
  }),
  DateTimeDisplay: ({ date }: { date: string }) => <span>{date}</span>,
}));
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ showToast: state.toast }) }));
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => state.supported,
  startRegistration: state.register,
}));
vi.mock('@attraccess/react-query-client', () => ({
  PasskeysService: { getPasskeyRegistrationOptions: state.getOptions, verifyPasskeyRegistration: state.verify },
  usePasskeysServiceListPasskeys: () => ({ data: state.keys, isLoading: state.loading, refetch: state.refetch }),
  usePasskeysServiceDeletePasskey: () => ({ mutateAsync: state.remove }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.supported = true;
  state.loading = false;
  state.keys = [];
  state.getOptions.mockResolvedValue({ options: { challenge: 'challenge' } });
  state.register.mockResolvedValue({ id: 'credential' });
  state.verify.mockResolvedValue(undefined);
  state.remove.mockResolvedValue(undefined);
  state.refetch.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('hides unsupported browsers and displays loading and empty states', () => {
  state.supported = false;
  const view = render(<PasskeysCard />);
  expect(view.container).toBeEmptyDOMElement();
  view.unmount();
  state.supported = true;
  state.loading = true;
  const loading = render(<PasskeysCard />);
  expect(loading.container.querySelector('.skeleton')).toBeTruthy();
  loading.unmount();
  state.loading = false;
  render(<PasskeysCard />);
  expect(screen.getByText('empty')).toBeTruthy();
});
it.each([' Laptop ', ''])('registers a passkey with name %s and refreshes the list', async (name) => {
  render(<PasskeysCard />);
  fireEvent.change(screen.getByRole('textbox', { name: 'nameLabel' }), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'actions.add' }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'success.added', type: 'success' }));
  expect(state.register).toHaveBeenCalledWith({ optionsJSON: { challenge: 'challenge' } });
  expect(state.verify).toHaveBeenCalledWith({
    requestBody: { response: { id: 'credential' }, name: name.trim() || undefined },
  });
  expect(state.refetch).toHaveBeenCalledOnce();
  expect(screen.getByRole('textbox', { name: 'nameLabel' })).toHaveValue('');
});
it.each(['NotAllowedError', 'AbortError', 'NetworkError'])(
  'handles registration failure %s and enables retry',
  async (name) => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    state.register.mockRejectedValue(Object.assign(new Error('Registration failed'), { name }));
    render(<PasskeysCard />);
    fireEvent.click(screen.getByRole('button', { name: 'actions.add' }));
    await waitFor(() => expect(state.register).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole('button', { name: 'actions.add' })).not.toBeDisabled());
    expect(state.verify).not.toHaveBeenCalled();
    if (name === 'NetworkError') {
      expect(state.toast).toHaveBeenCalledWith({ title: 'errors.addFailed', type: 'error' });
      expect(errorLog).toHaveBeenCalled();
    } else {
      expect(state.toast).not.toHaveBeenCalled();
      expect(errorLog).not.toHaveBeenCalled();
    }
  },
);
it('lists last-use information and handles successful and failed deletion', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  state.keys = [
    { id: 1, name: 'Laptop' },
    { id: 2, name: 'Phone', lastUsedAt: '2026-09-01' },
  ];
  render(<PasskeysCard />);
  expect(screen.getByText('neverUsed')).toBeTruthy();
  expect(screen.getByText('2026-09-01')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'actions.delete:Laptop' }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'success.deleted', type: 'success' }));
  expect(state.remove).toHaveBeenCalledWith({ id: 1 });
  expect(state.refetch).toHaveBeenCalledOnce();
  state.remove.mockRejectedValue(new Error('Unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'actions.delete:Phone' }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'errors.deleteFailed', type: 'error' }));
  expect(state.refetch).toHaveBeenCalledOnce();
});
