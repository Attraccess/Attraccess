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
  useAttractapServiceResetNfcCard: () => ({ mutate: state.reset }),
  useAttractapServiceEnrollNfcCard: (options: { onSuccess: () => void }) => ({
    mutate: (data: unknown) => {
      state.enroll(data);
      options.onSuccess();
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
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ error: vi.fn() }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
beforeEach(() => {
  vi.clearAllMocks();
  state.licensed = true;
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
