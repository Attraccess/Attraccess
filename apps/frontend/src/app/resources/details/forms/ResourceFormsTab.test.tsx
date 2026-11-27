import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ResourceFormsTab } from './ResourceFormsTab';

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  setOverride: vi.fn(),
  deleteOverride: vi.fn(),
  invalidate: vi.fn(),
  forms: [] as unknown[],
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => state.navigate,
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), error: vi.fn(), apiError: vi.fn() }),
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useResourceFormsList: () => ({ data: state.forms, isLoading: false, isError: false }),
  useResourceFormsSetOverride: () => ({ mutate: state.setOverride }),
  useResourceFormsDeleteOverride: () => ({ mutate: state.deleteOverride }),
}));

const flags = (start: boolean, takeover: boolean, end: boolean) => ({
  isRequiredOnResourceUsageStart: start,
  isRequiredOnResourceUsageTakeOver: takeover,
  isRequiredOnResourceUsageEnd: end,
  isRequiredOnResourceUsageProjectSwitch: false,
});
const applicable = (id: number, name: string, source: string, extra: Record<string, unknown> = {}) => ({
  form: { id, name, scope: source, fields: [], ...flags(false, false, true) },
  source,
  groupName: null,
  override: null,
  disabled: false,
  effective: flags(false, false, true),
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  state.forms = [
    applicable(1, 'Everywhere', 'global'),
    applicable(2, 'Laser safety', 'group', {
      groupName: 'Lasers',
      disabled: true,
      override: {
        disabled: true,
        ...flags(false, false, false),
        isRequiredOnResourceUsageTakeOver: null,
        isRequiredOnResourceUsageProjectSwitch: null,
      },
    }),
    applicable(3, 'Own checklist', 'resource', {
      override: {
        disabled: false,
        isRequiredOnResourceUsageStart: true,
        isRequiredOnResourceUsageTakeOver: null,
        isRequiredOnResourceUsageEnd: null,
        isRequiredOnResourceUsageProjectSwitch: null,
      },
      effective: flags(true, false, true),
    }),
  ];
});
afterEach(cleanup);

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/resources/7/forms']}>
      <Routes>
        <Route path="/resources/:id/forms" element={<ResourceFormsTab />} />
      </Routes>
    </MemoryRouter>,
  );

it('shows where each form comes from and the overrides in effect', () => {
  mount();
  expect(screen.getByText('Global')).toBeInTheDocument();
  expect(screen.getByText('Group: Lasers')).toBeInTheDocument();
  expect(screen.getByText('Resource')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Use Everywhere on this resource' })).toBeChecked();
  expect(screen.getByRole('switch', { name: 'Use Laser safety on this resource' })).not.toBeChecked();
  const ownStart = screen.getByRole('button', { name: /Start for Own checklist$/ });
  expect(ownStart).toHaveTextContent('Required');
  expect(screen.getByRole('button', { name: /End for Everywhere$/ })).toHaveTextContent('Inherit (required)');
});

it('switches an inherited form off and on, keeping other overrides', async () => {
  mount();
  await userEvent.click(screen.getByRole('switch', { name: 'Use Everywhere on this resource' }));
  expect(state.setOverride).toHaveBeenCalledWith({
    path: { resourceId: 7, formId: 1 },
    body: {
      disabled: true,
      isRequiredOnResourceUsageStart: null,
      isRequiredOnResourceUsageTakeOver: null,
      isRequiredOnResourceUsageEnd: null,
      isRequiredOnResourceUsageProjectSwitch: null,
    },
  });
  // Switching the disabled one back on keeps its flag overrides.
  await userEvent.click(screen.getByRole('switch', { name: 'Use Laser safety on this resource' }));
  expect(state.setOverride).toHaveBeenLastCalledWith({
    path: { resourceId: 7, formId: 2 },
    body: {
      disabled: false,
      isRequiredOnResourceUsageStart: false,
      isRequiredOnResourceUsageTakeOver: null,
      isRequiredOnResourceUsageEnd: false,
      isRequiredOnResourceUsageProjectSwitch: null,
    },
  });
});

it('overrides a flag, and removes an override that only inherits', async () => {
  mount();
  await userEvent.click(screen.getByRole('button', { name: /Takeover for Everywhere$/ }));
  await userEvent.click(await screen.findByRole('option', { name: 'Required' }));
  expect(state.setOverride).toHaveBeenCalledWith({
    path: { resourceId: 7, formId: 1 },
    body: {
      disabled: false,
      isRequiredOnResourceUsageStart: null,
      isRequiredOnResourceUsageTakeOver: true,
      isRequiredOnResourceUsageEnd: null,
      isRequiredOnResourceUsageProjectSwitch: null,
    },
  });

  await userEvent.click(screen.getByRole('button', { name: /Start for Own checklist$/ }));
  await userEvent.click(await screen.findByRole('option', { name: 'Inherit (not required)' }));
  await waitFor(() => expect(state.deleteOverride).toHaveBeenCalledWith({ path: { resourceId: 7, formId: 3 } }));
});

it('links to the editor, the filtered submissions and a new resource form', async () => {
  mount();
  const row = screen.getByRole('row', { name: /Own checklist/ });
  await userEvent.click(within(row).getByRole('button', { name: 'Actions for Own checklist' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit form' }));
  expect(state.navigate).toHaveBeenCalledWith('/forms/3');
  await userEvent.click(within(row).getByRole('button', { name: 'Actions for Own checklist' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Submissions' }));
  expect(state.navigate).toHaveBeenCalledWith('/forms/3?tab=submissions&resourceId=7');
  await userEvent.click(screen.getByRole('button', { name: 'New form' }));
  expect(state.navigate).toHaveBeenCalledWith('/forms/new?scope=resource&resourceId=7');
});

it('stores "Not required" as false, and keeps an override that still changes another flag', async () => {
  mount();
  await userEvent.click(screen.getByRole('button', { name: /End for Everywhere$/ }));
  await userEvent.click(await screen.findByRole('option', { name: 'Not required' }));
  expect(state.setOverride).toHaveBeenCalledWith({
    path: { resourceId: 7, formId: 1 },
    body: {
      disabled: false,
      isRequiredOnResourceUsageStart: null,
      isRequiredOnResourceUsageTakeOver: null,
      isRequiredOnResourceUsageEnd: false,
      isRequiredOnResourceUsageProjectSwitch: null,
    },
  });

  // Laser safety overrides start and end; inheriting end again still leaves an override to keep.
  state.forms = [
    applicable(2, 'Laser safety', 'group', {
      groupName: 'Lasers',
      override: {
        disabled: false,
        ...flags(true, false, false),
        isRequiredOnResourceUsageTakeOver: null,
        isRequiredOnResourceUsageProjectSwitch: null,
      },
    }),
  ];
  cleanup();
  mount();
  await userEvent.click(screen.getByRole('button', { name: /End for Laser safety$/ }));
  await userEvent.click(await screen.findByRole('option', { name: 'Inherit (required)' }));
  expect(state.deleteOverride).not.toHaveBeenCalled();
  expect(state.setOverride).toHaveBeenLastCalledWith({
    path: { resourceId: 7, formId: 2 },
    body: {
      disabled: false,
      isRequiredOnResourceUsageStart: true,
      isRequiredOnResourceUsageTakeOver: null,
      isRequiredOnResourceUsageEnd: null,
      isRequiredOnResourceUsageProjectSwitch: null,
    },
  });
});
