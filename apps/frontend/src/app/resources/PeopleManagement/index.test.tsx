import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, render, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, vi, expect, it } from 'vitest';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { PeopleManagement } from './index';
import type { AddPersonDrawer } from './AddPersonDrawer';
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
      hasValidDirectIntroduction: true,
      inheritedIntroductions: [] as Array<{ id: number; resourceGroupId: number; resourceGroup: { name: string } }>,
      introductionLastEventAt: '2026-09-01T12:00:00Z',
    },
    {
      user: { id: 2, username: 'Blair' },
      isIntroducer: false,
      isMaintainer: false,
      introducers: [],
      introduction: { id: 21 },
      hasValidIntroduction: false,
      hasValidDirectIntroduction: false,
      inheritedIntroductions: [] as Array<{ id: number; resourceGroupId: number; resourceGroup: { name: string } }>,
      introductionLastEventAt: '2026-08-01T12:00:00Z',
    },
    {
      user: { id: 3, username: 'Casey' },
      isIntroducer: false,
      isMaintainer: false,
      introducers: [],
      introduction: null,
      hasValidIntroduction: false,
      hasValidDirectIntroduction: false,
      inheritedIntroductions: [] as Array<{ id: number; resourceGroupId: number; resourceGroup: { name: string } }>,
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
    target,
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
        <span>
          for {target.type} {target.id}
        </span>
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
const originalLanguage = useTranslationState.getState().language;
afterEach(() => useTranslationState.getState().setLanguage(originalLanguage));
function mount(props: Partial<ComponentProps<typeof PeopleManagement>> = {}) {
  return render(
    <MemoryRouter>
      <PeopleManagement target={{ type: 'resource', id: 7 }} canManageIntroducers canManageIntroductions {...props} />
    </MemoryRouter>,
  );
}

async function openActions(name: string) {
  await userEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
  return screen.getByRole('menu');
}
function menuItemNames(menu: HTMLElement) {
  return within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent);
}
async function chooseAction(name: string, action: string) {
  const menu = await openActions(name);
  await userEvent.click(within(menu).getByRole('menuitem', { name: action }));
  return screen.findByRole('alertdialog');
}
async function closeMenu() {
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
}

const subtitleCases = [
  ['en', 'resource', false, 'Manage introducers, maintainers and introductions for this resource'],
  ['en', 'resource', true, 'Manage introducers, maintainers and introductions for this resource'],
  ['en', 'group', false, 'Manage introducers, maintainers and introductions for this group'],
  ['en', 'group', true, 'Manage introducers, maintainers and introductions for this group'],
  ['de', 'resource', false, 'Einweiser, Wartende und Einweisungen für diese Ressource verwalten'],
  ['de', 'resource', true, 'Einweiser, Wartende und Einweisungen für diese Ressource verwalten'],
  ['de', 'group', false, 'Einweiser, Wartende und Einweisungen für diese Gruppe verwalten'],
  ['de', 'group', true, 'Einweiser, Wartende und Einweisungen für diese Gruppe verwalten'],
] as const;
it.each(subtitleCases)('renders the %s %s subtitle (actions=%s)', (language, targetType, hasActions, subtitle) => {
  useTranslationState.getState().setLanguage(language);
  mount({ target: { type: targetType, id: 7 }, canManageIntroducers: hasActions, canManageIntroductions: false });
  expect(screen.getByText(subtitle)).toBeTruthy();
});
it.each(subtitleCases)(
  'hides the %s %s header while retaining people and actions (actions=%s)',
  (language, targetType, hasActions, subtitle) => {
    useTranslationState.getState().setLanguage(language);
    mount({
      target: { type: targetType, id: 7 },
      hideHeader: true,
      canManageIntroducers: hasActions,
      canManageIntroductions: hasActions,
    });
    expect(screen.queryByText(subtitle)).toBeNull();
    expect(screen.queryByText(language === 'en' ? 'People & Permissions' : 'Personen & Berechtigungen')).toBeNull();
    expect(screen.getByText('Alex')).toBeTruthy();
    const addIntroduction = screen.queryByRole('button', {
      name: language === 'en' ? 'Grant introduction' : 'Einweisung gewähren',
    });
    if (hasActions) expect(addIntroduction).toBeTruthy();
    else expect(addIntroduction).toBeNull();
  },
);

it('renders people, limits inherited-role removal, and handles history and introduction changes', async () => {
  mount();
  expect(screen.getByText('Alex')).toBeTruthy();
  expect(screen.getByText('Maintainer')).toBeTruthy();
  const menu = await openActions('Alex');
  expect(menuItemNames(menu)).toEqual([
    'View history',
    'Revoke direct introduction',
    'Revoke introducer status',
    'Revoke maintainer status',
  ]);
  expect(within(menu).getByRole('group', { name: 'Introduction' })).toBeTruthy();
  expect(within(menu).getByRole('group', { name: 'Introducer' })).toBeTruthy();
  await closeMenu();

  let dialog = await chooseAction('Alex', 'Revoke maintainer status');
  expect(within(dialog).getByText('Alex will lose maintainer privileges.')).toBeTruthy();
  expect(state.revokeIntroducer).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke maintainer status' }));
  await waitFor(() => expect(state.revokeIntroducer).toHaveBeenCalledWith(1, 'maintainer'));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

  dialog = await chooseAction('Alex', 'Revoke introducer status');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke introducer status' }));
  await waitFor(() => expect(state.revokeIntroducer).toHaveBeenCalledWith(1, 'introducer'));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

  await userEvent.click(within(await openActions('Alex')).getByRole('menuitem', { name: 'View history' }));
  expect(screen.getByText('History for 1')).toBeTruthy();
  fireEvent.click(screen.getByText('Close history'));
  expect(screen.queryByText('History for 1')).toBeNull();

  dialog = await chooseAction('Alex', 'Revoke direct introduction');
  await userEvent.type(within(dialog).getByRole('textbox', { name: 'Comment (optional)' }), 'Refresher required');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke direct introduction' }));
  await waitFor(() => expect(state.revokeIntroduction).toHaveBeenCalledWith(1, 'Refresher required'));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

  dialog = await chooseAction('Blair', 'Re-grant introduction');
  expect(within(dialog).getByRole('textbox', { name: 'Comment (optional)' })).toHaveValue('');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Re-grant introduction' }));
  await waitFor(() => expect(state.grantIntroduction).toHaveBeenCalledWith(2, ''));
});

it('keeps a revoke confirmation open when revoking fails', async () => {
  state.revokeIntroducer.mockRejectedValueOnce(new Error('nope'));
  mount();
  const dialog = await chooseAction('Alex', 'Revoke maintainer status');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke maintainer status' }));
  await waitFor(() => expect(state.revokeIntroducer).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('alertdialog')).toBeTruthy();
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
    {
      ...original[0],
      user: { id: 4, username: 'Introducer only' },
      isMaintainer: false,
      hasValidIntroduction: false,
    },
    {
      ...original[0],
      user: { id: 5, username: 'Maintainer only' },
      isIntroducer: false,
      hasValidIntroduction: false,
    },
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

it('hides modification controls for read-only viewers while retaining history', async () => {
  mount({ canManageIntroducers: false, canManageIntroductions: false });
  expect(screen.queryByRole('button', { name: 'Grant introduction' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Actions for Casey' })).toBeNull();
  expect(menuItemNames(await openActions('Alex'))).toEqual(['View history']);
  await closeMenu();
  expect(menuItemNames(await openActions('Blair'))).toEqual(['View history']);
});

it('allows group-scoped role removal and cancelling an introduction change', async () => {
  mount({ target: { type: 'group', id: 4 }, canManageIntroductions: true, canManageIntroducers: true });
  const menu = await openActions('Alex');
  expect(within(menu).getAllByRole('menuitem', { name: 'Revoke introducer status' })).toHaveLength(2);
  await closeMenu();

  let dialog = await chooseAction('Alex', 'Revoke introduction');
  await userEvent.type(within(dialog).getByRole('textbox', { name: 'Comment (optional)' }), 'Discard');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(state.revokeIntroduction).not.toHaveBeenCalled();

  dialog = await chooseAction('Alex', 'Revoke introduction');
  expect(within(dialog).getByRole('textbox', { name: 'Comment (optional)' })).toHaveValue('');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke introduction' }));
  await waitFor(() => expect(state.revokeIntroduction).toHaveBeenCalledWith(1, ''));
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

it('shows group-only users in All and Introduced with group links and no resource revoke', async () => {
  const original = state.rows;
  state.rows = [
    {
      ...original[2],
      user: { id: 8, username: 'Group trainee' },
      hasValidIntroduction: true,
      inheritedIntroductions: [
        { id: 80, resourceGroupId: 10, resourceGroup: { name: 'Deposition & Etch' } },
        { id: 81, resourceGroupId: 11, resourceGroup: { name: 'Cleanroom' } },
      ],
    },
  ];
  try {
    mount();
    expect(screen.getAllByText('Group trainee')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Introduced via Deposition & Etch' })).toHaveAttribute(
      'href',
      '/resource-groups/10',
    );
    expect(screen.getByRole('link', { name: 'Introduced via Cleanroom' })).toHaveAttribute(
      'href',
      '/resource-groups/11',
    );
    expect(screen.queryByRole('button', { name: 'Actions for Group trainee' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /All/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Only introduced' }));
    expect(screen.getByText('Group trainee')).toBeTruthy();
  } finally {
    state.rows = original;
  }
});

it('keeps inherited access and navigation visible after direct revocation', async () => {
  const original = state.rows;
  const trainee = {
    ...original[0],
    inheritedIntroductions: [{ id: 80, resourceGroupId: 10, resourceGroup: { name: 'Etch' } }],
  };
  state.rows = [trainee];
  try {
    const view = mount();
    expect(screen.getByText('Direct introduction')).toBeTruthy();
    expect(menuItemNames(await openActions('Alex'))).toContain('Revoke direct introduction');
    await closeMenu();
    state.rows = [{ ...trainee, hasValidDirectIntroduction: false }];
    view.rerender(
      <MemoryRouter>
        <PeopleManagement target={{ type: 'resource', id: 7 }} canManageIntroducers canManageIntroductions />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Introduced via Etch' })).toBeTruthy();
    const items = menuItemNames(await openActions('Alex'));
    expect(items).not.toContain('Revoke direct introduction');
    expect(items).toContain('Re-grant introduction');
  } finally {
    state.rows = original;
  }
});

it.each([false, true])('offers individual and mass introductions behind one button (hideHeader=%s)', (hideHeader) => {
  mount({ target: { type: 'group', id: 3 }, hideHeader, canManageIntroducers: false, canManageIntroductions: true });

  expect(screen.queryByRole('button', { name: 'Mass introduction' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Grant introduction' }));

  const drawer = screen.getByRole('region', { name: 'Add person' });
  expect(drawer.textContent).toContain('introduction');
  expect(drawer.textContent).toContain('for group 3');
});
