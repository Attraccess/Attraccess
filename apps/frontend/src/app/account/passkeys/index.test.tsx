import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
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
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({
      t: (key: string, params?: { name?: string }) => (params?.name ? `${key}:${params.name}` : key),
    }),
    DateTimeDisplay: ({ date }: { date: string }) => <span>{date}</span>,
  }))()),
}));
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ showToast: state.toast }) }));
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => state.supported,
  startRegistration: state.register,
}));
vi.mock('@attraccess/react-query-client', () => ({
  getPasskeyRegistrationOptions: state.getOptions,
  verifyPasskeyRegistration: state.verify,
  useListPasskeys: () => ({ data: state.keys, isLoading: state.loading, refetch: state.refetch }),
  useDeletePasskey: () => ({ mutateAsync: state.remove }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.supported = true;
  state.loading = false;
  state.keys = [];
  state.getOptions.mockResolvedValue({ data: { options: { challenge: 'challenge' } } });
  state.register.mockResolvedValue({ id: 'credential' });
  state.verify.mockResolvedValue({ data: undefined });
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
  expect(state.verify).toHaveBeenCalledWith(
    expect.objectContaining({ body: { response: { id: 'credential' }, name: name.trim() || undefined } }),
  );
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
  const user = userEvent.setup();
  const remove = async (id: number, name: string) => {
    await user.click(screen.getByRole('button', { name: `Actions for ${name}` }));
    await user.click(screen.getByRole('menuitem', { name: 'actions.delete' }));
    expect(await screen.findByRole('alertdialog', { name: `deleteConfirm.title:${name}` })).toBeInTheDocument();
    await user.click(document.querySelector(`[data-cy="passkey-delete-confirm-${id}"]`) as HTMLElement);
  };
  await remove(1, 'Laptop');
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'success.deleted', type: 'success' }));
  expect(state.remove).toHaveBeenCalledWith({ path: { id: 1 } });
  expect(state.refetch).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  state.remove.mockRejectedValue(new Error('Unavailable'));
  await remove(2, 'Phone');
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'errors.deleteFailed', type: 'error' }));
  expect(state.refetch).toHaveBeenCalledOnce();
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
});
it('deletes a passkey only after the confirmation, not on cancel', async () => {
  state.keys = [{ id: 1, name: 'Laptop' }];
  render(<PasskeysCard />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Actions for Laptop' }));
  await user.click(screen.getByRole('menuitem', { name: 'actions.delete' }));
  const dialog = await screen.findByRole('alertdialog', { name: 'deleteConfirm.title:Laptop' });
  expect(state.remove).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(state.remove).not.toHaveBeenCalled();
});
