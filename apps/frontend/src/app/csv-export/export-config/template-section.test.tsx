import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TemplateSection } from './template-section';
import { ConfiguredColumn } from './csv';

interface MutationOptions {
  onSuccess: (data: unknown, vars: unknown) => Promise<void> | void;
  onError: (error: unknown, vars: unknown) => void;
}

const state = vi.hoisted(() => ({
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public body: unknown = undefined,
    ) {
      super('api error');
    }
  },
  list: { data: [] as unknown[], isLoading: false, isError: false },
  listArgs: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  pending: { create: false, update: false, remove: false },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@attraccess/react-query-client', () => ({
  ApiError: state.ApiError,
  useAnalyticsServiceGetCsvExportTemplatesKey: 'templates',
  useAnalyticsServiceGetCsvExportTemplates: (...args: unknown[]) => {
    state.listArgs(...args);
    return state.list;
  },
  useAnalyticsServiceCreateCsvExportTemplate: (options: unknown) => ({
    mutate: (vars: unknown) => state.create(vars, options),
    isPending: state.pending.create,
  }),
  useAnalyticsServiceUpdateCsvExportTemplate: (options: unknown) => ({
    mutate: (vars: unknown) => state.update(vars, options),
    isPending: state.pending.update,
  }),
  useAnalyticsServiceDeleteCsvExportTemplate: (options: unknown) => ({
    mutate: (vars: unknown) => state.remove(vars, options),
    isPending: state.pending.remove,
  }),
}));
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => state.toast }));

const current: ConfiguredColumn[] = [
  { uid: 'a', type: 'field', fieldKey: 'resourceName', header: 'Machine' },
  { uid: 'b', type: 'constant', header: 'Org', value: '' },
];
const template = {
  id: 5,
  name: 'Accounting',
  exportType: 'resourceUsageHours',
  columns: [{ type: 'field', header: 'Machine', fieldKey: 'resourceName' }],
};
const otherTemplate = { ...template, id: 6, name: 'Payroll' };

const renderSection = (onApply = vi.fn(), columns = current) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TemplateSection exportType={'resourceUsageHours' as never} currentColumns={columns} onApply={onApply} />
    </QueryClientProvider>,
  );
const byCy = (cy: string) => document.querySelector(`[data-cy="${cy}"]`) as HTMLElement | null;
const press = (cy: string) => fireEvent.click(byCy(cy) as HTMLElement);
const nameInput = () => byCy('csv-export-template-name') as HTMLInputElement | null;

/** Resolves a captured mutation the way react-query does: callbacks get the response and the variables. */
const succeed = (mock: ReturnType<typeof vi.fn>, data: (vars: unknown) => unknown) =>
  mock.mockImplementation((vars, options: MutationOptions) => options.onSuccess(data(vars), vars));
const fail = (mock: ReturnType<typeof vi.fn>, error: unknown) =>
  mock.mockImplementation((vars, options: MutationOptions) => options.onError(error, vars));

const openSaveAs = async () => {
  press('csv-export-template-save-as');
  return waitFor(() => byCy('csv-export-template-save-as-name') as HTMLInputElement);
};

const selectTemplate = async (label: string) => {
  const trigger = document.querySelector(
    '[data-cy="csv-export-template-select"] button, button[data-cy="csv-export-template-select"]',
  ) as HTMLElement;
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('option', { name: label }));
};

beforeEach(() => {
  vi.clearAllMocks();
  state.list = { data: [template], isLoading: false, isError: false };
  state.pending = { create: false, update: false, remove: false };
});
afterEach(cleanup);

it('lists templates for the export type only and offers no update or delete without a selection', () => {
  renderSection();
  expect(state.listArgs).toHaveBeenCalledWith({ exportType: 'resourceUsageHours' });
  expect(byCy('csv-export-template-update')).toBeNull();
  expect(byCy('csv-export-template-delete')).toBeNull();
  expect(screen.getByRole('heading', { name: 'Templates' })).toBeInTheDocument();
});

it('disables the template select while the list is loading', () => {
  state.list = { data: undefined as never, isLoading: true, isError: false };
  renderSection();
  expect(byCy('csv-export-template-select')).toHaveAttribute('data-disabled', 'true');
});

it('shows a visible notice when the template list cannot be loaded', () => {
  state.list = { data: undefined as never, isLoading: false, isError: true };
  renderSection();
  expect(byCy('csv-export-template-load-error')).toHaveTextContent('The templates could not be loaded.');
});

it('saves the editor state as a new template with a trimmed name, the type and the columns', async () => {
  renderSection();
  const name = await openSaveAs();
  expect(byCy('csv-export-template-save-as-confirm')).toBeDisabled();
  fireEvent.change(name, { target: { value: ' Upload ' } });
  press('csv-export-template-save-as-confirm');
  expect(state.create).toHaveBeenCalledWith(
    {
      requestBody: {
        name: 'Upload',
        exportType: 'resourceUsageHours',
        columns: [
          { type: 'field', header: 'Machine', fieldKey: 'resourceName' },
          { type: 'constant', header: 'Org', value: '' },
        ],
      },
    },
    expect.anything(),
  );
});

it('sends a single create request when the name is submitted twice in a row', async () => {
  renderSection();
  const name = await openSaveAs();
  await userEvent.type(name, 'Upload{Enter}{Enter}');
  fireEvent.submit(byCy('csv-export-template-save-as-form') as HTMLElement);
  expect(state.create).toHaveBeenCalledTimes(1);
});

it('selects the new template, closes the dialog and confirms after saving as new', async () => {
  const created = { ...otherTemplate, name: 'Upload' };
  succeed(state.create, () => created);
  // stands in for the refetched list, which contains the new template
  state.list = { ...state.list, data: [template, created] };
  renderSection();
  const name = await openSaveAs();
  fireEvent.change(name, { target: { value: 'Upload' } });
  press('csv-export-template-save-as-confirm');
  await waitFor(() => expect(state.toast.success).toHaveBeenCalledWith({ title: 'Template "Upload" created' }));
  await waitFor(() => expect(byCy('csv-export-template-save-as-name')).toBeNull());
  expect(nameInput()?.value).toBe('Upload');
});

it('shows a clear message on the name field when the name already exists (409)', async () => {
  fail(state.create, new state.ApiError(409));
  renderSection();
  const name = await openSaveAs();
  fireEvent.change(name, { target: { value: 'Accounting' } });
  press('csv-export-template-save-as-confirm');
  expect(await screen.findByText('A template with this name already exists for this export type.')).toBeInTheDocument();
  expect(byCy('csv-export-template-save-as-error')).toBeInTheDocument();
  expect(state.toast.error).not.toHaveBeenCalled();
});

it("passes the server's message on when saving as new fails for another reason", async () => {
  fail(state.create, new state.ApiError(400, { message: 'columns must contain at most 200 elements' }));
  renderSection();
  const name = await openSaveAs();
  fireEvent.change(name, { target: { value: 'Upload' } });
  press('csv-export-template-save-as-confirm');
  expect(state.toast.error).toHaveBeenCalledWith({
    title: 'The template could not be saved.',
    description: 'columns must contain at most 200 elements',
  });
});

it('loads a selected template into the editor and updates it with the editor state and edited name', async () => {
  const onApply = vi.fn();
  renderSection(onApply);
  await selectTemplate('Accounting');
  expect(onApply).toHaveBeenCalledWith([
    expect.objectContaining({ type: 'field', fieldKey: 'resourceName', header: 'Machine' }),
  ]);
  // the editor still shows two columns (constant added) so the template is dirty
  expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  fireEvent.change(nameInput() as HTMLInputElement, { target: { value: 'Accounting 2' } });
  press('csv-export-template-update');
  expect(state.update).toHaveBeenCalledWith(
    {
      id: 5,
      requestBody: {
        name: 'Accounting 2',
        columns: [
          { type: 'field', header: 'Machine', fieldKey: 'resourceName' },
          { type: 'constant', header: 'Org', value: '' },
        ],
      },
    },
    expect.anything(),
  );
});

it('confirms a successful update', async () => {
  succeed(state.update, (vars) => ({
    ...template,
    name: (vars as { requestBody: { name: string } }).requestBody.name,
  }));
  renderSection();
  await selectTemplate('Accounting');
  fireEvent.change(nameInput() as HTMLInputElement, { target: { value: 'Accounting 2' } });
  press('csv-export-template-update');
  await waitFor(() => expect(state.toast.success).toHaveBeenCalledWith({ title: 'Template "Accounting 2" saved' }));
});

it('shows the duplicate-name error on the name field when renaming fails with 409', async () => {
  fail(state.update, new state.ApiError(409));
  renderSection();
  await selectTemplate('Accounting');
  fireEvent.change(nameInput() as HTMLInputElement, { target: { value: 'Payroll' } });
  press('csv-export-template-update');
  expect(await waitFor(() => byCy('csv-export-template-name-error'))).toHaveTextContent(
    'A template with this name already exists for this export type.',
  );
  // editing the name clears the error
  fireEvent.change(nameInput() as HTMLInputElement, { target: { value: 'Payroll 2' } });
  expect(byCy('csv-export-template-name-error')).toBeNull();
});

it("passes the server's message on when an update fails for another reason", async () => {
  fail(state.update, new state.ApiError(400, { message: ['name must be shorter'] }));
  renderSection();
  await selectTemplate('Accounting');
  press('csv-export-template-update');
  expect(state.toast.error).toHaveBeenCalledWith({
    title: 'The template could not be saved.',
    description: 'name must be shorter',
  });
  expect(byCy('csv-export-template-name-error')).toBeNull();
});

it('keeps the newly selected template when an update of the previous one finishes later', async () => {
  state.list = { ...state.list, data: [template, otherTemplate] };
  renderSection();
  await selectTemplate('Accounting');
  fireEvent.change(nameInput() as HTMLInputElement, { target: { value: 'Accounting 2' } });
  press('csv-export-template-update');
  const [vars, options] = state.update.mock.calls[0] as [unknown, MutationOptions];
  await selectTemplate('Payroll');
  expect(nameInput()?.value).toBe('Payroll');
  await act(() => options.onSuccess({ ...template, name: 'Accounting 2' }, vars));
  expect(nameInput()?.value).toBe('Payroll');
  expect(state.toast.success).toHaveBeenCalledWith({ title: 'Template "Accounting 2" saved' });
});

it('locks the template select while an update is running', async () => {
  state.pending.update = true;
  renderSection();
  expect(byCy('csv-export-template-select')).toHaveAttribute('data-disabled', 'true');
});

it('switching back to "No template" applies the default columns', async () => {
  const onApply = vi.fn();
  renderSection(onApply);
  await selectTemplate('Accounting');
  await selectTemplate('No template (default columns)');
  expect(onApply).toHaveBeenLastCalledWith(null);
});

it('asks for a destructive confirmation before deleting and only deletes from the dialog', async () => {
  renderSection();
  await selectTemplate('Accounting');
  press('csv-export-template-delete');
  expect(state.remove).not.toHaveBeenCalled();
  expect(await screen.findByText('Delete template?')).toBeInTheDocument();
  // StatusDialog status "error" is the only one with a danger action
  expect(byCy('csv-export-template-delete-confirm')?.className).toContain('button--danger');
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  expect(state.remove).not.toHaveBeenCalled();
  press('csv-export-template-delete');
  press('csv-export-template-delete-confirm');
  expect(state.remove).toHaveBeenCalledWith({ id: 5 }, expect.anything());
});

it('clears the selection, closes the dialog and confirms after deleting', async () => {
  succeed(state.remove, () => undefined);
  renderSection();
  await selectTemplate('Accounting');
  press('csv-export-template-delete');
  await waitFor(() => expect(byCy('csv-export-template-delete-confirm')).toBeTruthy());
  press('csv-export-template-delete-confirm');
  await waitFor(() => expect(state.toast.success).toHaveBeenCalledWith({ title: 'Template deleted' }));
  await waitFor(() => expect(byCy('csv-export-template-delete-dialog')).toBeNull());
  expect(byCy('csv-export-template-update')).toBeNull();
  expect(nameInput()).toBeNull();
});

it('stops offering a template that is already gone when the delete fails with 404', async () => {
  fail(state.remove, new state.ApiError(404));
  renderSection();
  await selectTemplate('Accounting');
  press('csv-export-template-delete');
  press('csv-export-template-delete-confirm');
  // selection is cleared, so there is nothing to update or delete any more
  await waitFor(() => expect(byCy('csv-export-template-update')).toBeNull());
  expect(byCy('csv-export-template-delete')).toBeNull();
  expect(state.toast.error).toHaveBeenCalledWith({
    title: 'The template could not be deleted.',
    description: 'api error',
  });
});
