import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormEditorPage } from './FormEditorPage';
import type { FormFieldEditor } from './components/FormFieldEditor';
const state = vi.hoisted(() => ({
  form: undefined as unknown,
  resources: undefined as unknown,
  submissions: { data: [], total: 0, page: 1, limit: 20 } as unknown,
  submissionsQuery: vi.fn(),
  loading: false,
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  apiError: vi.fn(),
  invalidate: vi.fn(),
  removeQueries: vi.fn(),
  callbacks: {} as Record<
    string,
    { onSuccess: (data: { id: number }) => Promise<void>; onError: (error: Error) => void }
  >,
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: state.invalidate, removeQueries: state.removeQueries }),
}));
vi.mock('../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error, apiError: state.apiError }),
}));
vi.mock('@attraccess/react-query-client', async (original) => ({
  ...(await original<typeof import('@attraccess/react-query-client')>()),
  useFormsGetOne: () => ({ data: state.form, isLoading: state.loading }),
  useFormsListResources: () => ({ data: state.resources }),
  useFormsListSubmissions: (...args: unknown[]) => {
    state.submissionsQuery(...args);
    return { data: state.submissions, isLoading: false, isError: false };
  },
  useResourceGroupsGetMany: () => ({ data: [{ id: 3, name: 'Lasers' }], isLoading: false }),
  useGetAllResources: () => ({ data: { data: [{ id: 7, name: 'Printer' }] }, isLoading: false }),
  useFormsCreate: (_mutationKey: unknown, callbacks: (typeof state.callbacks)[string]) => {
    state.callbacks.create = callbacks;
    return { mutateAsync: state.create, isPending: false };
  },
  useFormsUpdate: (_mutationKey: unknown, callbacks: (typeof state.callbacks)[string]) => {
    state.callbacks.update = callbacks;
    return { mutateAsync: state.update, isPending: false };
  },
  useFormsDelete: (_mutationKey: unknown, callbacks: (typeof state.callbacks)[string]) => {
    state.callbacks.remove = callbacks;
    return { mutateAsync: state.remove, isPending: false };
  },
}));
vi.mock('./components/FormFieldEditor', () => ({
  FormFieldEditor: ({ field, onChange, onRemove, labelInputRef }: ComponentProps<typeof FormFieldEditor>) => (
    <div>
      <input
        ref={labelInputRef}
        aria-label="Field label"
        value={field.name}
        onChange={(event) => onChange({ ...field, name: event.target.value })}
      />
      <button onClick={onRemove}>Remove field</button>
    </div>
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.form = undefined;
  state.resources = undefined;
  state.submissions = { data: [], total: 0, page: 1, limit: 20 };
  state.loading = false;
  state.callbacks = {};
  state.invalidate.mockResolvedValue(undefined);
  for (const name of ['create', 'update', 'remove'] as const)
    state[name].mockImplementation(async () => {
      await state.callbacks[name].onSuccess({ id: 11 });
      return { id: 11 };
    });
  if (!Element.prototype.getAnimations)
    Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [] });
});
afterEach(cleanup);
function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}
function mount(path = '/forms/new') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/forms/:formId" element={<FormEditorPage />} />
        <Route path="/forms" element={<p>Form list</p>} />
      </Routes>
      <Location />
    </MemoryRouter>,
  );
}
const saved = {
  id: 11,
  name: 'Safety',
  scope: 'group',
  resourceId: null,
  groupId: 3,
  isRequiredOnResourceUsageStart: true,
  isRequiredOnResourceUsageTakeOver: false,
  isRequiredOnResourceUsageEnd: false,
  fields: [
    {
      id: 1,
      name: 'Confirm training',
      type: 'text',
      description: 'Acknowledge',
      isRequired: true,
      options: null,
      position: 0,
    },
  ],
};
const applied = (resourceId: number, resourceName: string, disabled = false) => ({
  resourceId,
  resourceName,
  disabled,
  override: disabled
    ? {
        disabled: true,
        isRequiredOnResourceUsageStart: null,
        isRequiredOnResourceUsageTakeOver: null,
        isRequiredOnResourceUsageEnd: null,
      }
    : null,
  effective: {
    isRequiredOnResourceUsageStart: true,
    isRequiredOnResourceUsageTakeOver: false,
    isRequiredOnResourceUsageEnd: false,
  },
});
it('validates blank field labels then creates a resource form for the resource it was opened from', async () => {
  mount('/forms/new?scope=resource&resourceId=7');
  expect(screen.getByRole('button', { name: 'Save form' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: /Form name/ }), { target: { value: 'Safety' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save form' }));
  expect(state.error).toHaveBeenCalledWith({ title: 'Please complete every field label before saving.' });
  expect(state.create).not.toHaveBeenCalled();
  fireEvent.change(await screen.findByLabelText('Field label'), { target: { value: 'Confirm training' } });
  for (const name of [
    'Required by default at session start',
    'Required by default at takeover',
    'Required by default at session end',
  ])
    fireEvent.click(screen.getByRole('switch', { name }));
  fireEvent.click(screen.getByRole('button', { name: 'Save form' }));
  await waitFor(() =>
    expect(state.create).toHaveBeenCalledWith({
      body: expect.objectContaining({
        name: 'Safety',
        scope: 'resource',
        resourceId: 7,
        groupId: null,
        isRequiredOnResourceUsageStart: true,
        isRequiredOnResourceUsageTakeOver: true,
        isRequiredOnResourceUsageEnd: true,
        fields: [expect.objectContaining({ name: 'Confirm training', type: 'text', isRequired: true, position: 0 })],
      }),
    }),
  );
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['FormsList'] });
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['ResourceFormsList'] });
  expect(state.success).toHaveBeenCalledWith({ title: 'Form created' });
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/forms/11'));
});
it('starts as a global form and needs a group once the group scope is chosen', async () => {
  mount();
  fireEvent.change(screen.getByRole('textbox', { name: /Form name/ }), { target: { value: 'Everywhere' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
  fireEvent.change(await screen.findByLabelText('Field label'), { target: { value: 'Q' } });
  expect(screen.getByRole('button', { name: 'Save form' })).toBeEnabled();

  await userEvent.click(screen.getByRole('button', { name: /Scope$/ }));
  await userEvent.click(await screen.findByRole('option', { name: 'Group' }));
  expect(screen.getByText('Select a resource or group for this scope.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save form' })).toBeDisabled();

  await userEvent.click(screen.getByRole('button', { name: /Group$/ }));
  await userEvent.click(await screen.findByRole('option', { name: 'Lasers' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save form' }));
  await waitFor(() =>
    expect(state.create).toHaveBeenCalledWith({
      body: expect.objectContaining({ scope: 'group', groupId: 3, resourceId: null }),
    }),
  );
});
it('saves edits of a shared form, shows where it applies and warns that changes apply everywhere', async () => {
  state.form = saved;
  state.resources = [applied(1, 'Laser A'), applied(2, 'Laser B'), applied(4, 'Laser C', true)];
  mount('/forms/11');
  expect(await screen.findByDisplayValue('Safety')).toBeTruthy();
  expect(screen.queryByText('Unsaved changes')).toBeNull();
  expect(screen.getByText('Changes apply to all 2 resources.')).toBeTruthy();
  const appliesTo = screen.getByRole('grid', { name: 'Resources the form applies to' });
  expect(within(appliesTo).getByText('Laser C')).toBeTruthy();
  expect(within(appliesTo).getByText('Switched off')).toBeTruthy();
  expect(screen.getByText('Applies to 2 resources · 1 switched off')).toBeTruthy();

  fireEvent.change(screen.getByRole('textbox', { name: /Form name/ }), { target: { value: 'Safety revision' } });
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save form' }));
  await waitFor(() =>
    expect(state.update).toHaveBeenCalledWith({
      path: { formId: 11 },
      body: expect.objectContaining({
        name: 'Safety revision',
        scope: 'group',
        groupId: 3,
        fields: [expect.objectContaining({ id: 1, name: 'Confirm training', position: 0 })],
      }),
    }),
  );
  expect(state.success).toHaveBeenCalledWith({ title: 'Form updated' });
  fireEvent.click(screen.getByRole('button', { name: /#1 Confirm training/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Remove field' }));
  expect(screen.getByText('No fields')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save form' })).toBeDisabled();
});
it('warns before deleting that the form leaves every resource and submissions are kept', async () => {
  state.form = saved;
  state.resources = [applied(1, 'Laser A'), applied(2, 'Laser B')];
  mount('/forms/11');
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText(/removed from all 2 resources/)).toBeTruthy();
  expect(within(dialog).getByText(/submissions are kept/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(state.remove).toHaveBeenCalledWith({ path: { formId: 11 } }));
  expect(await screen.findByText('Form list')).toBeTruthy();
  expect(state.success).toHaveBeenCalledWith({ title: 'Form deleted' });
  // The deleted form's own queries are dropped, not refetched into a 404.
  expect(state.removeQueries).toHaveBeenCalledWith({ queryKey: ['FormsGetOne', { path: { formId: 11 } }] });
  expect(state.removeQueries).toHaveBeenCalledWith({ queryKey: ['FormsListResources', { path: { formId: 11 } }] });
});
it('counts switched-off resources in the delete warning and says when a form applies nowhere', async () => {
  state.form = saved;
  state.resources = [applied(1, 'Laser A'), applied(2, 'Laser B', true)];
  mount('/forms/11');
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  expect(within(await screen.findByRole('alertdialog')).getByText(/removed from all 2 resources/)).toBeTruthy();
  cleanup();

  state.resources = [];
  mount('/forms/11');
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  expect(within(await screen.findByRole('alertdialog')).getByText(/does not apply to any resource/)).toBeTruthy();
});
it('moves an existing form to another scope', async () => {
  state.form = saved;
  state.resources = [applied(1, 'Laser A')];
  mount('/forms/11');
  await userEvent.click(screen.getByRole('button', { name: /Scope$/ }));
  await userEvent.click(await screen.findByRole('option', { name: 'Global' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save form' }));
  await waitFor(() =>
    expect(state.update).toHaveBeenCalledWith({
      path: { formId: 11 },
      body: expect.objectContaining({ scope: 'global', groupId: null, resourceId: null }),
    }),
  );
});
it('starts a new resource filter of the submissions on its first page', async () => {
  state.form = saved;
  state.resources = [applied(1, 'Laser A'), applied(2, 'Laser B')];
  state.submissions = { data: [], total: 60, page: 1, limit: 20 };
  mount('/forms/11?tab=submissions');
  await userEvent.click(await screen.findByRole('button', { name: /next/i }));
  await waitFor(() =>
    expect(state.submissionsQuery).toHaveBeenLastCalledWith({ path: { formId: 11 }, query: { page: 2, limit: 20 } }),
  );
  await userEvent.click(screen.getByRole('button', { name: /Resource$/ }));
  await userEvent.click(await screen.findByRole('option', { name: 'Laser B' }));
  await waitFor(() =>
    expect(state.submissionsQuery).toHaveBeenLastCalledWith({
      path: { formId: 11 },
      query: { page: 1, limit: 20, resourceId: 2 },
    }),
  );
});
it('lists submissions filtered to the resource it was opened for, with their answers', async () => {
  state.form = saved;
  state.resources = [applied(1, 'Laser A')];
  state.submissions = {
    total: 1,
    page: 1,
    limit: 20,
    data: [
      {
        id: 31,
        createdAt: '2030-01-01T10:00:00Z',
        action: 'end',
        user: { id: 5, username: 'ada' },
        resource: { id: 1, name: 'Laser A' },
        data: {
          '1': { value: 'yes', fieldDefinition: { id: 1, name: 'Goggles worn?', position: 0 } },
          '2': { value: 'false', fieldDefinition: { id: 2, name: 'Guard fitted?', position: 1, type: 'boolean' } },
        },
      },
    ],
  };
  mount('/forms/11?tab=submissions&resourceId=1');
  expect(await screen.findByTestId('location')).toHaveTextContent('tab=submissions');
  expect(state.submissionsQuery).toHaveBeenCalledWith({
    path: { formId: 11 },
    query: { page: 1, limit: 20, resourceId: 1 },
  });
  expect(screen.getByText('ada')).toBeTruthy();
  expect(screen.getAllByText('Laser A').length).toBeGreaterThan(0);
  expect(screen.getByText('End')).toBeTruthy();
  expect(screen.queryByText('Goggles worn?')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show answers' }));
  expect(screen.getByText('Goggles worn?')).toBeTruthy();
  expect(screen.getByText('yes')).toBeTruthy();
  // A yes/no answer reads as in the usage history, not as the stored "false".
  expect(screen.getByText('No')).toBeTruthy();
  expect(screen.queryByText('false')).toBeNull();
});
it('forwards mutation errors to the API error presenter and shows edit loading', () => {
  state.loading = true;
  const view = mount('/forms/11');
  expect(view.container.querySelector('.spinner')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save form' })).toBeNull();
  const error = new Error('Forbidden');
  for (const name of ['create', 'update', 'remove']) state.callbacks[name].onError(error);
  expect(state.apiError).toHaveBeenCalledTimes(3);
  expect(state.apiError).toHaveBeenLastCalledWith(expect.objectContaining({ error, baseTranslationKey: 'api' }));
});
