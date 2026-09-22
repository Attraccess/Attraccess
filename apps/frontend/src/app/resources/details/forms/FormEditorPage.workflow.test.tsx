import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormEditorPage } from './FormEditorPage';
import type { FormFieldEditor } from './components/FormFieldEditor';
const state = vi.hoisted(() => ({
  form: undefined as unknown,
  loading: false,
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  apiError: vi.fn(),
  invalidate: vi.fn(),
  callbacks: {} as Record<
    string,
    { onSuccess: (data: { id: number }) => Promise<void>; onError: (error: Error) => void }
  >,
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error, apiError: state.apiError }),
}));
vi.mock('@attraccess/react-query-client', async (original) => ({
  ...(await original<typeof import('@attraccess/react-query-client')>()),
  useResourcesServiceGetOneResourceById: () => ({ data: { id: 7, name: 'Printer' } }),
  useResourceFormsServiceResourceFormsGetOne: () => ({ data: state.form, isLoading: state.loading }),
  UseResourceFormsServiceResourceFormsListKeyFn: (params: unknown) => ['forms', params],
  UseResourceFormsServiceResourceFormsGetOneKeyFn: (params: unknown) => ['form', params],
  useResourceFormsServiceResourceFormsCreate: (callbacks: (typeof state.callbacks)[string]) => {
    state.callbacks.create = callbacks;
    return { mutateAsync: state.create, isPending: false };
  },
  useResourceFormsServiceResourceFormsUpdate: (callbacks: (typeof state.callbacks)[string]) => {
    state.callbacks.update = callbacks;
    return { mutateAsync: state.update, isPending: false };
  },
  useResourceFormsServiceResourceFormsDelete: (callbacks: (typeof state.callbacks)[string]) => {
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
function mount(formId = 'new') {
  return render(
    <MemoryRouter initialEntries={[`/resources/7/forms/${formId}`]}>
      <Routes>
        <Route path="/resources/:id/forms/:formId" element={<FormEditorPage />} />
        <Route path="/resources/:id/forms" element={<p>Form list</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
const saved = {
  id: 11,
  name: 'Safety',
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
it('validates blank field labels then creates a form with the selected lifecycle requirements', async () => {
  mount();
  expect(screen.getByRole('button', { name: 'Save form' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: /Form name/ }), { target: { value: 'Safety' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save form' }));
  expect(state.error).toHaveBeenCalledWith({ title: 'Please complete every field label before saving.' });
  expect(state.create).not.toHaveBeenCalled();
  fireEvent.change(await screen.findByLabelText('Field label'), { target: { value: 'Confirm training' } });
  for (const name of [
    'Require before starting a session',
    'Require before taking over a session',
    'Require before ending a session',
  ])
    fireEvent.click(screen.getByRole('switch', { name }));
  fireEvent.click(screen.getByRole('button', { name: 'Save form' }));
  await waitFor(() =>
    expect(state.create).toHaveBeenCalledWith({
      resourceId: 7,
      requestBody: expect.objectContaining({
        name: 'Safety',
        isRequiredOnResourceUsageStart: true,
        isRequiredOnResourceUsageTakeOver: true,
        isRequiredOnResourceUsageEnd: true,
        fields: [expect.objectContaining({ name: 'Confirm training', type: 'text', isRequired: true, position: 0 })],
      }),
    }),
  );
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['forms', { resourceId: 7 }] });
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['form', { resourceId: 7, formId: 11 }] });
  expect(state.success).toHaveBeenCalledWith({ title: 'Form created' });
});
it('loads existing fields, saves edits, and removes draft fields', async () => {
  state.form = saved;
  mount('11');
  expect(await screen.findByDisplayValue('Safety')).toBeTruthy();
  expect(screen.queryByText('Unsaved changes')).toBeNull();
  fireEvent.change(screen.getByRole('textbox', { name: /Form name/ }), { target: { value: 'Safety revision' } });
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save form' }));
  await waitFor(() =>
    expect(state.update).toHaveBeenCalledWith({
      resourceId: 7,
      formId: 11,
      requestBody: expect.objectContaining({
        name: 'Safety revision',
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
it('confirms deletion and refreshes list and detail queries', async () => {
  state.form = saved;
  mount('11');
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete form' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(state.remove).toHaveBeenCalledWith({ resourceId: 7, formId: 11 }));
  expect(await screen.findByText('Form list')).toBeTruthy();
  expect(state.success).toHaveBeenCalledWith({ title: 'Form deleted' });
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['forms', { resourceId: 7 }] });
});
it('forwards mutation errors to the API error presenter and shows edit loading', () => {
  state.loading = true;
  const view = mount('11');
  expect(view.container.querySelector('.spinner')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save form' })).toBeNull();
  const error = new Error('Forbidden');
  for (const name of ['create', 'update', 'remove']) state.callbacks[name].onError(error);
  expect(state.apiError).toHaveBeenCalledTimes(3);
  expect(state.apiError).toHaveBeenLastCalledWith(expect.objectContaining({ error, baseTranslationKey: 'api' }));
});
