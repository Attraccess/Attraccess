import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormListPage } from './FormListPage';
const state = vi.hoisted(() => ({
  id: '7',
  navigate: vi.fn(),
  query: vi.fn(),
  forms: [] as {
    id: number;
    name: string;
    fields: unknown[];
    updatedAt: string;
    isRequiredOnResourceUsageStart: boolean;
    isRequiredOnResourceUsageTakeOver: boolean;
    isRequiredOnResourceUsageEnd: boolean;
  }[],
  loading: false,
  fetched: true,
}));
vi.mock('react-router-dom', () => ({ useParams: () => ({ id: state.id }), useNavigate: () => state.navigate }));
vi.mock('@attraccess/react-query-client', () => ({
  useResourceFormsServiceResourceFormsList: (...args: unknown[]) => {
    state.query(...args);
    return { data: state.forms, isLoading: state.loading, isFetched: state.fetched };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.id = '7';
  state.forms = [];
  state.loading = false;
  state.fetched = true;
});
afterEach(cleanup);
it('scopes the query and navigates to create a form from the empty state', () => {
  render(<FormListPage />);
  expect(state.query).toHaveBeenCalledWith({ resourceId: 7 }, undefined, { enabled: true });
  expect(screen.getByText(/No forms yet/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Create form' }));
  expect(state.navigate).toHaveBeenCalledWith('/resources/7/forms/new');
});
it('renders requirements and opens the selected form', () => {
  state.forms = [
    {
      id: 11,
      name: 'Safety checklist',
      fields: [{}],
      updatedAt: '2026-09-01T12:00:00Z',
      isRequiredOnResourceUsageStart: true,
      isRequiredOnResourceUsageTakeOver: true,
      isRequiredOnResourceUsageEnd: true,
    },
    {
      id: 12,
      name: 'Optional checklist',
      fields: [],
      updatedAt: '2026-09-02T12:00:00Z',
      isRequiredOnResourceUsageStart: false,
      isRequiredOnResourceUsageTakeOver: false,
      isRequiredOnResourceUsageEnd: false,
    },
  ];
  render(<FormListPage />);
  for (const label of ['On start', 'On takeover', 'On end']) expect(screen.getByText(label)).toBeTruthy();
  fireEvent.click(screen.getByText('Safety checklist'));
  expect(state.navigate).toHaveBeenCalledWith('/resources/7/forms/11');
  expect(screen.queryByText(/No forms yet/)).toBeNull();
});
it('does not show an empty result while loading and disables invalid resource queries', () => {
  state.id = 'invalid';
  state.loading = true;
  state.fetched = false;
  const { container } = render(<FormListPage />);
  expect(state.query).toHaveBeenCalledWith({ resourceId: NaN }, undefined, { enabled: false });
  expect(screen.queryByText(/No forms yet/)).toBeNull();
  expect(container.querySelector('.spinner')).toBeTruthy();
});
