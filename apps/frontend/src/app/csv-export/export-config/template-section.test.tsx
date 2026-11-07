import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TemplateSection } from './template-section';
import { ConfiguredColumn } from './csv';

const state = vi.hoisted(() => ({
  templates: [] as unknown[],
  listArgs: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@attraccess/react-query-client', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number) {
      super('api error');
    }
  },
  useAnalyticsServiceGetCsvExportTemplatesKey: 'templates',
  useAnalyticsServiceGetCsvExportTemplates: (...args: unknown[]) => {
    state.listArgs(...args);
    return { data: state.templates };
  },
  useAnalyticsServiceCreateCsvExportTemplate: (options: unknown) => ({
    mutate: (vars: unknown) => state.create(vars, options),
    isPending: false,
  }),
  useAnalyticsServiceUpdateCsvExportTemplate: (options: unknown) => ({
    mutate: (vars: unknown) => state.update(vars, options),
    isPending: false,
  }),
  useAnalyticsServiceDeleteCsvExportTemplate: (options: unknown) => ({
    mutate: (vars: unknown) => state.remove(vars, options),
    isPending: false,
  }),
}));

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

const renderSection = (onApply = vi.fn(), columns = current) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TemplateSection exportType={'resourceUsageHours' as never} currentColumns={columns} onApply={onApply} />
    </QueryClientProvider>,
  );
const press = (cy: string) => fireEvent.click(document.querySelector(`[data-cy="${cy}"]`) as HTMLElement);

beforeEach(() => {
  vi.clearAllMocks();
  state.templates = [template];
});
afterEach(cleanup);

it('lists templates for the export type only and offers no update or delete without a selection', () => {
  renderSection();
  expect(state.listArgs).toHaveBeenCalledWith({ exportType: 'resourceUsageHours' });
  expect(document.querySelector('[data-cy="csv-export-template-update"]')).toBeNull();
  expect(document.querySelector('[data-cy="csv-export-template-delete"]')).toBeNull();
});

it('saves the editor state as a new template and trims nothing but sends the type and columns', async () => {
  renderSection();
  press('csv-export-template-save-as');
  const name = await waitFor(
    () => document.querySelector('[data-cy="csv-export-template-save-as-name"]') as HTMLInputElement,
  );
  expect(document.querySelector('[data-cy="csv-export-template-save-as-confirm"]')).toBeDisabled();
  fireEvent.change(name, { target: { value: 'Upload' } });
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

it('shows a clear message when the name already exists (409)', async () => {
  const { ApiError } = await import('@attraccess/react-query-client');
  state.create.mockImplementation((_vars, options: { onError: (error: unknown) => void }) =>
    options.onError(new (ApiError as unknown as new (status: number) => Error)(409)),
  );
  renderSection();
  press('csv-export-template-save-as');
  const name = await waitFor(
    () => document.querySelector('[data-cy="csv-export-template-save-as-name"]') as HTMLInputElement,
  );
  fireEvent.change(name, { target: { value: 'Accounting' } });
  press('csv-export-template-save-as-confirm');
  expect(await screen.findByText('A template with this name already exists for this export type.')).toBeInTheDocument();
});

const selectTemplate = async (label: string) => {
  const trigger = document.querySelector(
    '[data-cy="csv-export-template-select"] button, button[data-cy="csv-export-template-select"]',
  ) as HTMLElement;
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('option', { name: label }));
};

it('loads a selected template into the editor and updates it with the editor state and edited name', async () => {
  const onApply = vi.fn();
  renderSection(onApply);
  await selectTemplate('Accounting');
  expect(onApply).toHaveBeenCalledWith([
    expect.objectContaining({ type: 'field', fieldKey: 'resourceName', header: 'Machine' }),
  ]);
  // the editor still shows two columns (constant added) so the template is dirty
  expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  fireEvent.change(document.querySelector('[data-cy="csv-export-template-name"]') as HTMLInputElement, {
    target: { value: 'Accounting 2' },
  });
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

it('switching back to "No template" applies the default columns', async () => {
  const onApply = vi.fn();
  renderSection(onApply);
  await selectTemplate('Accounting');
  await selectTemplate('No template (default columns)');
  expect(onApply).toHaveBeenLastCalledWith(null);
});

it('asks for confirmation before deleting and only deletes from the dialog', async () => {
  renderSection();
  await selectTemplate('Accounting');
  press('csv-export-template-delete');
  expect(state.remove).not.toHaveBeenCalled();
  expect(await screen.findByText('Delete template?')).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  expect(state.remove).not.toHaveBeenCalled();
  press('csv-export-template-delete');
  press('csv-export-template-delete-confirm');
  expect(state.remove).toHaveBeenCalledWith({ id: 5 }, expect.anything());
});
