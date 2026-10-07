import { fireEvent } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { expect } from 'vitest';
import { it } from 'vitest';
import type { RootTestRegistrationsTestScope } from './index.test';
import { waitFor } from '@testing-library/react';
import { within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PeopleManagement } from './index';

export function registerAllowsGroupScopedRoleRemovalAndCancellingAnIntroductionChange(
  scope: RootTestRegistrationsTestScope,
): void {
  it('allows group-scoped role removal and cancelling an introduction change', () => {
    scope.mount({ target: { type: 'group', id: 4 }, canManageIntroductions: true, canManageIntroducers: true });
    expect(screen.getAllByRole('button', { name: 'Revoke introducer status' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke introduction' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Discard' } });
    fireEvent.click(screen.getByText('Cancel reason'));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke introduction' }));
    expect(screen.getByLabelText('Reason')).toHaveValue('');
    expect(scope.state.revokeIntroduction).not.toHaveBeenCalled();
  });
}

export function registerDispatchesAllAddModesAndClearsCommentDraftsHideHeaderS(
  scope: RootTestRegistrationsTestScope,
): void {
  it.each([false, true])('dispatches all add modes and clears comment drafts (hideHeader=%s)', async (hideHeader) => {
    scope.mount({ hideHeader });
    for (const [label, mode, mutation] of [
      ['Grant introduction', 'introduction', scope.state.grantIntroduction],
      ['Appoint as introducer', 'introducer', scope.state.grantIntroducer],
      ['Appoint as maintainer', 'maintainer', scope.state.grantMaintainer],
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
}

export function registerFiltersRolesAndIntroducedUsersWithDistinctMemberships(
  scope: RootTestRegistrationsTestScope,
): void {
  it('filters roles and introduced users with distinct memberships', async () => {
    const original = scope.state.rows;
    scope.state.rows = [
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
      scope.mount();
      for (const [label, matching] of [
        ['Only introducers', 'Introducer only'],
        ['Only maintainers', 'Maintainer only'],
        ['Only introduced', 'Introduced only'],
      ]) {
        fireEvent.click(screen.getByRole('button', { name: /All|Only introducers|Only maintainers|Only introduced/ }));
        fireEvent.click(await screen.findByRole('option', { name: label }));
        expect(screen.getByText('Alex')).toBeTruthy();
        expect(screen.getByText(matching)).toBeTruthy();
        for (const other of ['Introducer only', 'Maintainer only', 'Introduced only'].filter(
          (name) => name !== matching,
        ))
          expect(screen.queryByText(other)).toBeNull();
        expect(screen.queryByText('Blair')).toBeNull();
        expect(screen.queryByText('Casey')).toBeNull();
      }
      fireEvent.click(screen.getByRole('button', { name: /Only introduced/ }));
      fireEvent.click(await screen.findByRole('option', { name: 'All' }));
      expect(screen.getByText('Blair')).toBeTruthy();
    } finally {
      scope.state.rows = original;
    }
  });
}

export function registerHidesModificationControlsForReadOnlyViewersWhileRetainingHistory(
  scope: RootTestRegistrationsTestScope,
): void {
  it('hides modification controls for read-only viewers while retaining history', () => {
    scope.mount({ canManageIntroducers: false, canManageIntroductions: false });
    expect(screen.queryByRole('button', { name: 'Grant introduction' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Revoke direct introduction' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Revoke maintainer status' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'View history' })).toHaveLength(2);
  });
}

export function registerKeepsInheritedAccessAndNavigationVisibleAfterDirectRevocation(
  scope: RootTestRegistrationsTestScope,
): void {
  it('keeps inherited access and navigation visible after direct revocation', () => {
    const original = scope.state.rows;
    const trainee = {
      ...original[0],
      inheritedIntroductions: [{ id: 80, resourceGroupId: 10, resourceGroup: { name: 'Etch' } }],
    };
    scope.state.rows = [trainee];
    try {
      const view = scope.mount();
      expect(screen.getByText('Direct introduction')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Revoke direct introduction' })).toBeTruthy();
      scope.state.rows = [{ ...trainee, hasValidDirectIntroduction: false }];
      view.rerender(
        <MemoryRouter>
          <PeopleManagement target={{ type: 'resource', id: 7 }} canManageIntroducers canManageIntroductions />
        </MemoryRouter>,
      );
      expect(screen.getByRole('link', { name: 'Introduced via Etch' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Revoke direct introduction' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Re-grant introduction' })).toBeTruthy();
    } finally {
      scope.state.rows = original;
    }
  });
}

export function registerRendersPeopleLimitsInheritedRoleRemovalAndHandlesHistoryAndIntroductionChanges(
  scope: RootTestRegistrationsTestScope,
): void {
  it('renders people, limits inherited-role removal, and handles history and introduction changes', async () => {
    scope.mount();
    expect(screen.getByText('Alex')).toBeTruthy();
    expect(screen.getByText('Maintainer')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Revoke introducer status' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke maintainer status' }));
    expect(scope.state.revokeIntroducer).toHaveBeenCalledWith(1, 'maintainer');
    fireEvent.click(screen.getByRole('button', { name: 'Revoke introducer status' }));
    expect(scope.state.revokeIntroducer).toHaveBeenCalledWith(1, 'introducer');
    fireEvent.click(screen.getAllByRole('button', { name: 'View history' })[0]);
    expect(screen.getByText('History for 1')).toBeTruthy();
    fireEvent.click(screen.getByText('Close history'));
    expect(screen.queryByText('History for 1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke direct introduction' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Refresher required' } });
    fireEvent.click(screen.getByText('Submit reason'));
    await waitFor(() => expect(scope.state.revokeIntroduction).toHaveBeenCalledWith(1, 'Refresher required'));
    await waitFor(() => expect(screen.queryByLabelText('Reason')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Re-grant introduction' }));
    expect(screen.getByLabelText('Reason')).toHaveValue('');
    fireEvent.click(screen.getByText('Submit reason'));
    await waitFor(() => expect(scope.state.grantIntroduction).toHaveBeenCalledWith(2, ''));
  });
}

export function registerShowsGroupOnlyUsersInAllAndIntroducedWithGroupLinksAndNoResourceRevoke(
  scope: RootTestRegistrationsTestScope,
): void {
  it('shows group-only users in All and Introduced with group links and no resource revoke', async () => {
    const original = scope.state.rows;
    scope.state.rows = [
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
      scope.mount();
      expect(screen.getAllByText('Group trainee')).toHaveLength(1);
      expect(screen.getByRole('link', { name: 'Introduced via Deposition & Etch' })).toHaveAttribute(
        'href',
        '/resource-groups/10',
      );
      expect(screen.getByRole('link', { name: 'Introduced via Cleanroom' })).toHaveAttribute(
        'href',
        '/resource-groups/11',
      );
      expect(screen.queryByRole('button', { name: 'Revoke direct introduction' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'View history' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /All/ }));
      fireEvent.click(await screen.findByRole('option', { name: 'Only introduced' }));
      expect(screen.getByText('Group trainee')).toBeTruthy();
    } finally {
      scope.state.rows = original;
    }
  });
}

export function registerShowsLoadingAndFetchFailureStatesWithoutStalePeople(
  scope: RootTestRegistrationsTestScope,
): void {
  it('shows loading and fetch failure states without stale people', () => {
    scope.state.loading = true;
    const view = scope.mount();
    expect(screen.queryByText('Alex')).toBeNull();
    expect(document.querySelector('[data-cy="people-loading-spinner"]')).toBeTruthy();
    view.unmount();
    scope.state.error = true;
    scope.mount();
    expect(screen.getByText('Failed to load data')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
}
