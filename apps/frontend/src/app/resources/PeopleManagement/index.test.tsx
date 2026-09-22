import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PeopleManagement } from './index';
import type { AddPersonDrawer } from './AddPersonDrawer';
import type { IntroductionCommentModal } from './IntroductionCommentModal';
import type { HistoryModalLoader } from './HistoryModalLoader';
const state = vi.hoisted(() => ({
  error: false,
  loading: false,
  grantIntroducer: vi.fn(),
  grantMaintainer: vi.fn(),
  grantIntroduction: vi.fn(),
  revokeIntroduction: vi.fn(),
  revokeIntroducer: vi.fn(),
  rows: [
    {
      user: { id: 1, username: 'Alex' },
      isIntroducer: true,
      isMaintainer: true,
      introducers: [
        { id: 10, type: 'introducer', resourceId: 7 },
        { id: 11, type: 'maintainer', resourceId: 7 },
        { id: 12, type: 'introducer', resourceId: null },
      ],
      introduction: { id: 20 },
      hasValidIntroduction: true,
      introductionLastEventAt: '2026-09-01T12:00:00Z',
    },
    {
      user: { id: 2, username: 'Blair' },
      isIntroducer: false,
      isMaintainer: false,
      introducers: [],
      introduction: { id: 21 },
      hasValidIntroduction: false,
      introductionLastEventAt: '2026-08-01T12:00:00Z',
    },
    {
      user: { id: 3, username: 'Casey' },
      isIntroducer: false,
      isMaintainer: false,
      introducers: [],
      introduction: null,
      hasValidIntroduction: false,
      introductionLastEventAt: null,
    },
  ],
}));
vi.mock('./usePeopleRows', () => ({
  usePeopleRows: () => ({ rows: state.rows, isLoading: state.loading, hasError: state.error }),
}));
vi.mock('./usePeopleMutations', () => ({
  usePeopleMutations: () => ({
    grantIntroducer: state.grantIntroducer,
    grantMaintainer: state.grantMaintainer,
    grantIntroduction: state.grantIntroduction,
    revokeIntroduction: state.revokeIntroduction,
    revokeIntroducer: state.revokeIntroducer,
    pendingIntroducer: null,
    pendingIntroductionUserId: null,
    isRevokingIntroducer: false,
    isGrantingIntroduction: false,
    isRevokingIntroduction: false,
    isMutating: false,
  }),
}));
vi.mock('./AddPersonDrawer', () => ({
  AddPersonDrawer: ({
    isOpen,
    mode,
    comment,
    onCommentChange,
    onAdd,
    onClose,
  }: ComponentProps<typeof AddPersonDrawer>) =>
    isOpen ? (
      <section aria-label="Add person">
        <span>{mode}</span>
        <input aria-label="Add comment" value={comment} onChange={(e) => onCommentChange(e.target.value)} />
        <button
          onClick={async () => {
            await onAdd({ id: 9, username: 'New person' });
            onClose();
          }}
        >
          Confirm person
        </button>
        <button onClick={onClose}>Cancel person</button>
      </section>
    ) : null,
}));
vi.mock('./IntroductionCommentModal', () => ({
  IntroductionCommentModal: ({
    isOpen,
    comment,
    onCommentChange,
    onSubmit,
    onClose,
  }: ComponentProps<typeof IntroductionCommentModal>) =>
    isOpen ? (
      <section aria-label="Introduction comment">
        <input aria-label="Reason" value={comment} onChange={(e) => onCommentChange(e.target.value)} />
        <button onClick={onSubmit}>Submit reason</button>
        <button onClick={onClose}>Cancel reason</button>
      </section>
    ) : null,
}));
vi.mock('./HistoryModalLoader', () => ({
  HistoryModalLoader: ({ userId, isOpen, onClose }: ComponentProps<typeof HistoryModalLoader>) =>
    isOpen ? (
      <div>
        History for {userId}
        <button onClick={onClose}>Close history</button>
      </div>
    ) : null,
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.error = false;
  state.loading = false;
  for (const name of [
    'grantIntroducer',
    'grantMaintainer',
    'grantIntroduction',
    'revokeIntroduction',
    'revokeIntroducer',
  ] as const)
    state[name].mockResolvedValue(undefined);
});
afterEach(cleanup);
function mount(props: Partial<ComponentProps<typeof PeopleManagement>> = {}) {
  return render(
    <MemoryRouter>
      <PeopleManagement target={{ type: 'resource', id: 7 }} canManageIntroducers canManageIntroductions {...props} />
    </MemoryRouter>,
  );
}
it('renders people, limits inherited-role removal, and handles history and introduction changes', async () => {
  mount();
  expect(screen.getByText('Alex')).toBeTruthy();
  expect(screen.getByText('Maintainer')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Revoke introducer status' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Revoke maintainer status' }));
  expect(state.revokeIntroducer).toHaveBeenCalledWith(1, 'maintainer');
  fireEvent.click(screen.getByRole('button', { name: 'Revoke introducer status' }));
  expect(state.revokeIntroducer).toHaveBeenCalledWith(1, 'introducer');
  fireEvent.click(screen.getAllByRole('button', { name: 'View history' })[0]);
  expect(screen.getByText('History for 1')).toBeTruthy();
  fireEvent.click(screen.getByText('Close history'));
  expect(screen.queryByText('History for 1')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Revoke introduction' }));
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Refresher required' } });
  fireEvent.click(screen.getByText('Submit reason'));
  await waitFor(() => expect(state.revokeIntroduction).toHaveBeenCalledWith(1, 'Refresher required'));
  await waitFor(() => expect(screen.queryByLabelText('Reason')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Re-grant introduction' }));
  expect(screen.getByLabelText('Reason')).toHaveValue('');
  fireEvent.click(screen.getByText('Submit reason'));
  await waitFor(() => expect(state.grantIntroduction).toHaveBeenCalledWith(2, ''));
});
it.each([false, true])('dispatches all add modes and clears comment drafts (hideHeader=%s)', async (hideHeader) => {
  mount({ hideHeader });
  for (const [label, mode, mutation] of [
    ['Grant introduction', 'introduction', state.grantIntroduction],
    ['Appoint as introducer', 'introducer', state.grantIntroducer],
    ['Appoint as maintainer', 'maintainer', state.grantMaintainer],
  ] as const) {
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(within(screen.getByRole('region', { name: 'Add person' })).getByText(mode)).toBeTruthy();
    expect(screen.getByLabelText('Add comment')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Add comment'), { target: { value: 'Completed briefing' } });
    fireEvent.click(screen.getByText('Confirm person'));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Add person' })).toBeNull());
    if (mode === 'introduction') expect(mutation).toHaveBeenCalledWith(9, 'Completed briefing');
    else expect(mutation).toHaveBeenCalledWith(9);
  }
  fireEvent.click(screen.getByRole('button', { name: 'Grant introduction' }));
  fireEvent.change(screen.getByLabelText('Add comment'), { target: { value: 'Discard' } });
  fireEvent.click(screen.getByText('Cancel person'));
  fireEvent.click(screen.getByRole('button', { name: 'Grant introduction' }));
  expect(screen.getByLabelText('Add comment')).toHaveValue('');
});
it('filters roles and introduced users with distinct memberships', async () => {
  const original = state.rows;
  state.rows = [
    ...original,
    { ...original[0], user: { id: 4, username: 'Introducer only' }, isMaintainer: false, hasValidIntroduction: false },
    { ...original[0], user: { id: 5, username: 'Maintainer only' }, isIntroducer: false, hasValidIntroduction: false },
    { ...original[0], user: { id: 6, username: 'Introduced only' }, isIntroducer: false, isMaintainer: false },
  ];
  try {
    mount();
    for (const [label, matching] of [
      ['Only introducers', 'Introducer only'],
      ['Only maintainers', 'Maintainer only'],
      ['Only introduced', 'Introduced only'],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: /All|Only introducers|Only maintainers|Only introduced/ }));
      fireEvent.click(await screen.findByRole('option', { name: label }));
      expect(screen.getByText('Alex')).toBeTruthy();
      expect(screen.getByText(matching)).toBeTruthy();
      for (const other of ['Introducer only', 'Maintainer only', 'Introduced only'].filter((name) => name !== matching))
        expect(screen.queryByText(other)).toBeNull();
      expect(screen.queryByText('Blair')).toBeNull();
      expect(screen.queryByText('Casey')).toBeNull();
    }
    fireEvent.click(screen.getByRole('button', { name: /Only introduced/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'All' }));
    expect(screen.getByText('Blair')).toBeTruthy();
  } finally {
    state.rows = original;
  }
});
it('hides modification controls for read-only viewers while retaining history', () => {
  mount({ canManageIntroducers: false, canManageIntroductions: false });
  expect(screen.queryByRole('button', { name: 'Grant introduction' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Revoke introduction' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Revoke maintainer status' })).toBeNull();
  expect(screen.getAllByRole('button', { name: 'View history' })).toHaveLength(2);
});
it('allows group-scoped role removal and cancelling an introduction change', () => {
  mount({ target: { type: 'group', id: 4 }, canManageIntroductions: true, canManageIntroducers: true });
  expect(screen.getAllByRole('button', { name: 'Revoke introducer status' })).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Revoke introduction' }));
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Discard' } });
  fireEvent.click(screen.getByText('Cancel reason'));
  fireEvent.click(screen.getByRole('button', { name: 'Revoke introduction' }));
  expect(screen.getByLabelText('Reason')).toHaveValue('');
  expect(state.revokeIntroduction).not.toHaveBeenCalled();
});
it('shows loading and fetch failure states without stale people', () => {
  state.loading = true;
  const view = mount();
  expect(screen.queryByText('Alex')).toBeNull();
  expect(document.querySelector('[data-cy="people-loading-spinner"]')).toBeTruthy();
  view.unmount();
  state.error = true;
  mount();
  expect(screen.getByText('Failed to load data')).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
});
