import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@attraccess/react-query-client';
import { ResourceGroupEditPage } from './index';

const state = vi.hoisted(() => ({
  group: undefined as unknown,
  loading: false,
  error: undefined as unknown,
}));
vi.mock('@attraccess/react-query-client', async (original) => ({
  ...(await original<typeof import('@attraccess/react-query-client')>()),
  useResourceGroupsGetOne: () => ({ data: state.group, isLoading: state.loading, error: state.error }),
}));
vi.mock('./GroupDetailsForm', () => ({ GroupDetailsForm: () => <div>details form</div> }));
vi.mock('../resources/PeopleManagement', () => ({ PeopleManagement: () => <div>people</div> }));

beforeEach(() => {
  state.group = { id: 3, name: 'Wood shop' };
  state.loading = false;
  state.error = undefined;
});
afterEach(cleanup);

function mount() {
  return render(
    <MemoryRouter initialEntries={['/resource-groups/3']}>
      <Routes>
        <Route path="/resource-groups/:groupId" element={<ResourceGroupEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function apiError(status: number) {
  return Object.assign(Object.create(ApiError.prototype), { status, message: `HTTP ${status}` });
}

it('shows the group with its forms', () => {
  mount();
  expect(screen.getByText('Wood shop')).toBeTruthy();
  expect(screen.getByText('details form')).toBeTruthy();
});

it('shows "Group not found" for a group that answers 404 (hidden or missing, ATT-843)', async () => {
  state.group = undefined;
  state.error = apiError(404);
  mount();
  expect(screen.getByText('Group not found')).toBeTruthy();
  expect(screen.queryByText('Failed to load group')).toBeNull();
});

it('keeps the load error for other failures', async () => {
  state.group = undefined;
  state.error = apiError(500);
  mount();
  expect(screen.getByText('Failed to load group')).toBeTruthy();
});

it('does not show stale group data next to a 404', async () => {
  state.error = apiError(404);
  mount();
  expect(screen.getByText('Group not found')).toBeTruthy();
  expect(screen.queryByText('Wood shop')).toBeNull();
});
