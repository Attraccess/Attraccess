import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { PeopleManagement } from './index';
import type { AddPersonDrawer } from './AddPersonDrawer';
import type { IntroductionCommentModal } from './IntroductionCommentModal';
import type { HistoryModalLoader } from './HistoryModalLoader';
import { registerRendersPeopleLimitsInheritedRoleRemovalAndHandlesHistoryAndIntroductionChanges } from './index.test-cases';
import { registerDispatchesAllAddModesAndClearsCommentDraftsHideHeaderS } from './index.test-cases';
import { registerFiltersRolesAndIntroducedUsersWithDistinctMemberships } from './index.test-cases';
import { registerHidesModificationControlsForReadOnlyViewersWhileRetainingHistory } from './index.test-cases';
import { registerAllowsGroupScopedRoleRemovalAndCancellingAnIntroductionChange } from './index.test-cases';
import { registerShowsLoadingAndFetchFailureStatesWithoutStalePeople } from './index.test-cases';
import { registerShowsGroupOnlyUsersInAllAndIntroducedWithGroupLinksAndNoResourceRevoke } from './index.test-cases';
import { registerKeepsInheritedAccessAndNavigationVisibleAfterDirectRevocation } from './index.test-cases';

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
defineRootTestRegistrationsTests();

export function defineRootTestRegistrationsTests() {
  const scope = {
    mount,
    get state() {
      return state;
    },
  };

  registerRendersPeopleLimitsInheritedRoleRemovalAndHandlesHistoryAndIntroductionChanges(scope);

  registerDispatchesAllAddModesAndClearsCommentDraftsHideHeaderS(scope);

  registerFiltersRolesAndIntroducedUsersWithDistinctMemberships(scope);

  registerHidesModificationControlsForReadOnlyViewersWhileRetainingHistory(scope);

  registerAllowsGroupScopedRoleRemovalAndCancellingAnIntroductionChange(scope);

  registerShowsLoadingAndFetchFailureStatesWithoutStalePeople(scope);

  registerShowsGroupOnlyUsersInAllAndIntroducedWithGroupLinksAndNoResourceRevoke(scope);

  registerKeepsInheritedAccessAndNavigationVisibleAfterDirectRevocation(scope);

  return scope;
}

export type RootTestRegistrationsTestScope = ReturnType<typeof defineRootTestRegistrationsTests>;
