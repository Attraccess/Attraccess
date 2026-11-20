import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ResourceFlowVariableScope as Scope } from '@attraccess/react-query-client';
import { VariablesModal } from './index';
const state = vi.hoisted(() => ({
  rows: [] as { scope: string; key: string; valueType: string; value: unknown; updatedAt: string }[],
  upsert: vi.fn(),
  remove: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  upsertOptions: {} as { onSuccess: () => void; onError: (error: unknown) => void },
  removeOptions: {} as { onSuccess: () => void; onError: (error: unknown) => void },
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
    useDateTimeFormatter: () => (date: string) => date,
  }))()),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, apiError: state.error }),
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  UseListFlowVariablesKeyFn: ({ path: { resourceId } }: { path: { resourceId: number } }) => ['variables', resourceId],
  useListFlowVariables: () => ({ data: state.rows }),
  useUpsertFlowVariable: (_mutationKey: unknown, options: typeof state.upsertOptions) => {
    state.upsertOptions = options;
    return { mutate: state.upsert };
  },
  useDeleteFlowVariable: (_mutationKey: unknown, options: typeof state.removeOptions) => {
    state.removeOptions = options;
    return { mutateAsync: state.remove };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [];
});
afterEach(cleanup);
async function chooseAction(row: string, action: string) {
  await userEvent.click(screen.getByRole('button', { name: `Actions for ${row}` }));
  await userEvent.click(await screen.findByRole('menuitem', { name: action }));
}
async function open() {
  render(<VariablesModal resourceId={7}>{(open) => <button onClick={open}>Variables</button>}</VariablesModal>);
  fireEvent.click(screen.getByText('Variables'));
  await screen.findByText('subtitle');
}
it('filters global and resource values and truncates long previews', async () => {
  state.rows = [
    { scope: Scope.RESOURCE, key: 'description', valueType: 'string', value: 'A'.repeat(90), updatedAt: 'Today' },
    {
      scope: Scope.GLOBAL,
      key: 'configuration',
      valueType: 'object',
      value: { enabled: true },
      updatedAt: 'Yesterday',
    },
  ];
  await open();
  expect(screen.getByText('A'.repeat(77) + '…')).toBeTruthy();
  expect(screen.queryByText('configuration')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'tabs.global' }));
  expect(screen.getByText('configuration')).toBeTruthy();
  expect(screen.getByText('{"enabled":true}')).toBeTruthy();
  expect(screen.queryByText('description')).toBeNull();
});
it('creates a variable through the real editor and refreshes its resource cache', async () => {
  await open();
  expect(screen.getByText('table.empty')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'actions.add' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'editor.key' }), { target: { value: ' greeting ' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'editor.value' }), { target: { value: 'Hello' } });
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.upsert).toHaveBeenCalledWith({
    path: { resourceId: 7, scope: Scope.RESOURCE, key: 'greeting' },
    body: { value: 'Hello' },
  });
  act(() => state.upsertOptions.onSuccess());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['variables', 7] });
  expect(state.success).toHaveBeenCalledWith({ title: 'toast.saved.title' });
  expect(screen.queryByText('editor.createTitle')).toBeNull();
});
it('edits existing values without changing their key and reports save failures', async () => {
  state.rows = [{ scope: Scope.RESOURCE, key: 'greeting', valueType: 'string', value: 'Hello', updatedAt: 'Today' }];
  await open();
  await chooseAction('greeting', 'actions.edit');
  expect(screen.getByRole('textbox', { name: 'editor.key' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'editor.value' }), { target: { value: 'Welcome' } });
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.upsert).toHaveBeenCalledWith({
    path: { resourceId: 7, scope: Scope.RESOURCE, key: 'greeting' },
    body: { value: 'Welcome' },
  });
  const error = new Error('Denied');
  act(() => state.upsertOptions.onError(error));
  expect(state.error).toHaveBeenCalledWith(expect.objectContaining({ error }));
  fireEvent.click(screen.getByRole('button', { name: 'actions.cancel' }));
  expect(screen.getByText('greeting')).toBeTruthy();
});
it('keeps the placeholder row without actions while there are no variables', async () => {
  await open();
  expect(screen.getByText('table.empty')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
});
it('requires confirmation before deletion and handles its success and error callbacks', async () => {
  state.rows = [{ scope: Scope.RESOURCE, key: 'old', valueType: 'number', value: 42, updatedAt: 'Today' }];
  state.remove.mockResolvedValue(undefined);
  await open();
  await chooseAction('old', 'actions.delete');
  let dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText('actions.confirmDeleteMessage')).toBeTruthy();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(state.remove).not.toHaveBeenCalled();
  await chooseAction('old', 'actions.delete');
  dialog = await screen.findByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'actions.delete' }));
  expect(state.remove).toHaveBeenCalledWith({ path: { resourceId: 7, scope: Scope.RESOURCE, key: 'old' } });
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  const error = new Error('Denied');
  act(() => state.removeOptions.onError(error));
  expect(state.error).toHaveBeenCalledWith(expect.objectContaining({ error }));
  act(() => state.removeOptions.onSuccess());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['variables', 7] });
  expect(state.success).toHaveBeenCalledWith({ title: 'toast.deleted.title' });
});
