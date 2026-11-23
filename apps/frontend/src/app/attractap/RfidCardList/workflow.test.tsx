import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RfidCardList } from './index';
const state = vi.hoisted(() => ({
  reset: vi.fn(),
  enroll: vi.fn(),
  toggle: vi.fn(),
  invalidate: vi.fn(),
  licensed: true,
  cardsQuery: vi.fn(),
  toastError: vi.fn(),
  enrollFails: null as unknown,
  resetFails: null as unknown,
  deleteUidOnly: vi.fn(),
  deleteUidOnlyFails: null as unknown,
  allowUidOnlyCards: false,
  settingsLoaded: true,
}));
vi.mock('@attraccess/react-query-client', () => ({
  useGetAllCards: (params: unknown) => {
    state.cardsQuery(params);
    return {
      data: [
        { id: 7, uid: 'AA-BB', isActive: true, createdAt: '2026-09-01T10:00:00Z', lastSeen: '2026-09-02T10:00:00Z' },
        { id: 8, uid: 'CC-DD', isActive: false },
        { id: 9, uid: 'EE-FF', isActive: true, type: 'uid-only' },
      ],
    };
  },
  useResetNfcCard: (_mutationKey: unknown, options: { onSuccess: () => void; onError: (error: unknown) => void }) => ({
    mutate: (data: unknown) => {
      state.reset(data);
      if (state.resetFails) options.onError(state.resetFails);
    },
  }),
  useEnrollNfcCard: (_mutationKey: unknown, options: { onSuccess: () => void; onError: (error: unknown) => void }) => ({
    mutate: (data: unknown) => {
      state.enroll(data);
      if (state.enrollFails) options.onError(state.enrollFails);
      else options.onSuccess();
    },
  }),
  useToggleCardActive: (_mutationKey: unknown, options: { onSuccess: () => void }) => ({
    mutateAsync: async (data: unknown) => {
      state.toggle(data);
      options.onSuccess();
    },
  }),
  useDeleteUidOnlyCard: (
    _mutationKey: unknown,
    options: { onSuccess: () => void; onError: (error: unknown) => void },
  ) => ({
    mutateAsync: async (data: unknown) => {
      state.deleteUidOnly(data);
      if (state.deleteUidOnlyFails) options.onError(state.deleteUidOnlyFails);
      else options.onSuccess();
    },
  }),
  useGetCardWriterSettings: () => ({
    data: state.settingsLoaded ? { mode: 'all', readerIds: [], allowUidOnlyCards: state.allowUidOnlyCards } : undefined,
  }),
  UseGetAllCardsKeyFn: () => ['cards'],
  useGetOneUserById: () => ({ data: undefined }),
  useGetLicenseInformation: () => ({ data: { modules: state.licensed ? ['attractap'] : [] } }),
}));
vi.mock('../AttractapSelect', () => ({
  AttractapSelect: ({
    label,
    selection,
    onSelectionChange,
  }: {
    label: string;
    selection: number | null;
    onSelectionChange: (value: number | null) => void;
  }) => (
    <select
      aria-label={label}
      value={selection ?? ''}
      onChange={(event) => onSelectionChange(event.target.value ? Number(event.target.value) : null)}
    >
      <option value="">Choose</option>
      <option value="4">Reader 4</option>
    </select>
  ),
}));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
// Resolve API error toasts the way ToastProvider does, so the test sees the text a user reads.
vi.mock('../../../components/toastProvider', async () => {
  const { getTranslationKeyForApiError } = await import('../../../utils/apiError');
  return {
    useToastMessage: () => ({
      error: state.toastError,
      apiError: (props: Parameters<typeof getTranslationKeyForApiError>[0]) => {
        const { key, errorMessage } = getTranslationKeyForApiError(props);
        state.toastError({
          title: props.t(key + '.title'),
          description: props.t(key + '.description', { error: errorMessage }),
        });
      },
    }),
  };
});
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
beforeEach(() => {
  vi.clearAllMocks();
  state.licensed = true;
  state.enrollFails = null;
  state.resetFails = null;
  state.deleteUidOnlyFails = null;
  state.allowUidOnlyCards = false;
  state.settingsLoaded = true;
});
afterEach(cleanup);
const openRowMenu = async (uid: string) => {
  await userEvent.click(screen.getByRole('button', { name: `Actions for ${uid}` }));
  return screen.getByRole('menu');
};
it('renders card identities and requires a reader before deleting a card', async () => {
  render(
    <MemoryRouter>
      <RfidCardList />
    </MemoryRouter>,
  );
  expect(screen.getByText('AA-BB')).toBeInTheDocument();
  expect(screen.getByText('CC-DD')).toBeInTheDocument();
  expect(within(screen.getByText('AA-BB').closest('tr') as HTMLElement).getByText('Active')).toBeInTheDocument();
  expect(within(screen.getByText('CC-DD').closest('tr') as HTMLElement).getByText('Inactive')).toBeInTheDocument();
  await userEvent.click(within(await openRowMenu('AA-BB')).getByRole('menuitem', { name: 'Delete' }));
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' })).toBeDisabled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Select Attractap' }), { target: { value: '4' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
  expect(state.reset).toHaveBeenCalledWith({ body: { readerId: 4, cardId: 7 } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
it.each([
  { uid: 'AA-BB', action: 'Deactivate', id: 7, active: false },
  { uid: 'CC-DD', action: 'Activate', id: 8, active: true },
])('confirms $action for the correct card', async ({ uid, action, id, active }) => {
  render(
    <MemoryRouter>
      <RfidCardList />
    </MemoryRouter>,
  );
  const menu = await openRowMenu(uid);
  expect(
    within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent),
  ).toEqual([action, 'Delete']);
  await userEvent.click(within(menu).getByRole('menuitem', { name: action }));
  const dialog = await screen.findByRole('alertdialog');
  expect(state.toggle).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole('button', { name: action }));
  expect(state.toggle).toHaveBeenCalledWith({ path: { id }, body: { active } });
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['cards'] });
});
it('enrolls on the selected reader and hides the page without a license', () => {
  const view = render(
    <MemoryRouter>
      <RfidCardList />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Enroll RFID Card' }));
  expect(screen.getByRole('button', { name: 'Enroll' })).toBeDisabled();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enroll' }));
  expect(state.enroll).toHaveBeenCalledWith({ body: { readerId: 4 } });
  expect(screen.queryByRole('dialog')).toBeNull();
  view.unmount();
  state.licensed = false;
  render(
    <MemoryRouter>
      <RfidCardList />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('grid')).toBeNull();
});

it('lists and enrolls cards for the selected user instead of the acting admin', () => {
  render(
    <MemoryRouter>
      <RfidCardList userId={23} />
    </MemoryRouter>,
  );
  expect(state.cardsQuery).toHaveBeenCalledWith({ query: { userId: 23 } });
  expect(screen.getByRole('heading', { name: 'RFID Cards — #23' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Enroll RFID Card' }));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enroll' }));
  expect(state.enroll).toHaveBeenCalledWith({ body: { readerId: 4, userId: 23 } });
});

it.each([
  ['READER_OFFLINE', 'Reader not connected'],
  ['READER_BUSY', 'Reader busy'],
  ['READER_FIRMWARE_UPDATE_REQUIRED', 'Firmware update required'],
  ['READER_NOT_ALLOWED_TO_WRITE_CARDS', 'Reader not allowed'],
])('tells the user why the reader refused (%s) in their language, not the raw code', (code, title) => {
  state.enrollFails = Object.assign(new Error('Refused'), { body: { message: code } });
  render(
    <MemoryRouter>
      <RfidCardList />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Enroll RFID Card' }));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enroll' }));
  expect(state.toastError).toHaveBeenCalledTimes(1);
  const [{ title: shownTitle, description }] = state.toastError.mock.calls[0];
  expect(shownTitle).toBe(title);
  expect(description).not.toContain(code);
});

it('reports a failed reset through the same translated reasons', async () => {
  state.resetFails = Object.assign(new Error('Refused'), { body: { message: 'READER_BUSY' } });
  render(
    <MemoryRouter>
      <RfidCardList />
    </MemoryRouter>,
  );
  await userEvent.click(within(await openRowMenu('AA-BB')).getByRole('menuitem', { name: 'Delete' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Select Attractap' }), { target: { value: '4' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
  expect(state.toastError).toHaveBeenCalledWith(expect.objectContaining({ title: 'Reader busy' }));
});

it('marks a UID-only card with a warning chip, and says so when the setting is off', () => {
  state.allowUidOnlyCards = true;
  const view = render(
    <MemoryRouter>
      <RfidCardList />
    </MemoryRouter>,
  );
  const row = () => screen.getByText('EE-FF').closest('tr') as HTMLElement;
  expect(within(row()).getByText('UID only')).toBeInTheDocument();
  expect(within(screen.getByText('AA-BB').closest('tr') as HTMLElement).queryByText(/UID only/)).toBeNull();
  view.unmount();

  state.allowUidOnlyCards = false;
  render(
    <MemoryRouter>
      <RfidCardList />
    </MemoryRouter>,
  );
  expect(within(row()).getByText('UID only, disabled')).toBeInTheDocument();
});

it('does not claim "disabled" before the setting is known', () => {
  state.settingsLoaded = false;
  render(
    <MemoryRouter>
      <RfidCardList />
    </MemoryRouter>,
  );
  expect(screen.getByText('UID only')).toBeInTheDocument();
});

it('deletes a UID-only card after a confirmation, without choosing a reader', async () => {
  render(
    <MemoryRouter>
      <RfidCardList />
    </MemoryRouter>,
  );
  await userEvent.click(within(await openRowMenu('EE-FF')).getByRole('menuitem', { name: 'Delete' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(state.deleteUidOnly).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  expect(state.deleteUidOnly).toHaveBeenCalledWith({ path: { id: 9 } });
  expect(state.reset).not.toHaveBeenCalled();
  await waitFor(() => expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['cards'] }));
});

it('shows the translated API error when a card cannot be deleted without a reader', async () => {
  state.deleteUidOnlyFails = { message: 'Bad Request', body: { message: 'CARD_NOT_UID_ONLY' } };
  render(
    <MemoryRouter>
      <RfidCardList />
    </MemoryRouter>,
  );
  await userEvent.click(within(await openRowMenu('EE-FF')).getByRole('menuitem', { name: 'Delete' }));
  await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
  expect(state.toastError).toHaveBeenCalledWith({
    title: 'Secure card',
    description: 'Only UID-only cards are deleted without a reader. Reset this card through a reader.',
  });
});
