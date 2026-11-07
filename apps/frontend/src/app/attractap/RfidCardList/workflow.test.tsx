import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
}));
vi.mock('@attraccess/react-query-client', () => ({
  useAttractapServiceGetAllCards: (params: unknown) => {
    state.cardsQuery(params);
    return {
      data: [
        { id: 7, uid: 'AA-BB', isActive: true, createdAt: '2026-09-01T10:00:00Z', lastSeen: '2026-09-02T10:00:00Z' },
        { id: 8, uid: 'CC-DD', isActive: false },
      ],
    };
  },
  useAttractapServiceResetNfcCard: (options: { onSuccess: () => void; onError: (error: unknown) => void }) => ({
    mutate: (data: unknown) => {
      state.reset(data);
      if (state.resetFails) options.onError(state.resetFails);
    },
  }),
  useAttractapServiceEnrollNfcCard: (options: { onSuccess: () => void; onError: (error: unknown) => void }) => ({
    mutate: (data: unknown) => {
      state.enroll(data);
      if (state.enrollFails) options.onError(state.enrollFails);
      else options.onSuccess();
    },
  }),
  useAttractapServiceToggleCardActive: () => ({ mutate: state.toggle }),
  UseAttractapServiceGetAllCardsKeyFn: () => ['cards'],
  useUsersServiceGetOneUserById: () => ({ data: undefined }),
  useLicenseServiceGetLicenseInformation: () => ({ data: { modules: state.licensed ? ['attractap'] : [] } }),
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
});
afterEach(cleanup);
it('renders card identities and requires a reader before deleting a card', () => {
  render(
    <MemoryRouter>
      <RfidCardList />
    </MemoryRouter>,
  );
  expect(screen.getByText('AA-BB')).toBeInTheDocument();
  expect(screen.getByText('CC-DD')).toBeInTheDocument();
  const row = screen.getByText('AA-BB').closest('tr');
  if (!row) throw new Error('Card row not found');
  fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' })).toBeDisabled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Select Attractap' }), { target: { value: '4' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
  expect(state.reset).toHaveBeenCalledWith({ requestBody: { readerId: 4, cardId: 7 } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
it.each([
  { uid: 'AA-BB', action: 'Deactivate', id: 7, active: false },
  { uid: 'CC-DD', action: 'Activate', id: 8, active: true },
])('confirms $action for the correct card', ({ uid, action, id, active }) => {
  render(
    <MemoryRouter>
      <RfidCardList />
    </MemoryRouter>,
  );
  const row = screen.getByText(uid).closest('tr');
  if (!row) throw new Error('Card row not found');
  fireEvent.click(within(row).getByRole('button', { name: action }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: action }));
  expect(state.toggle).toHaveBeenCalledWith({ id, requestBody: { active } });
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
  expect(state.enroll).toHaveBeenCalledWith({ requestBody: { readerId: 4 } });
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
  expect(state.cardsQuery).toHaveBeenCalledWith({ userId: 23 });
  expect(screen.getByRole('heading', { name: 'RFID Cards — #23' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Enroll RFID Card' }));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enroll' }));
  expect(state.enroll).toHaveBeenCalledWith({ requestBody: { readerId: 4, userId: 23 } });
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

it('reports a failed reset through the same translated reasons', () => {
  state.resetFails = Object.assign(new Error('Refused'), { body: { message: 'READER_BUSY' } });
  render(
    <MemoryRouter>
      <RfidCardList />
    </MemoryRouter>,
  );
  const row = screen.getByText('AA-BB').closest('tr');
  if (!row) throw new Error('Card row not found');
  fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Select Attractap' }), { target: { value: '4' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
  expect(state.toastError).toHaveBeenCalledWith(expect.objectContaining({ title: 'Reader busy' }));
});
