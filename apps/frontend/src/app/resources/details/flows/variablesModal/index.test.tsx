import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
  useDateTimeFormatter: () => (date: string) => date,
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, apiError: state.error }),
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  UseFlowVariablesServiceListFlowVariablesKeyFn: ({ resourceId }: { resourceId: number }) => ['variables', resourceId],
  useFlowVariablesServiceListFlowVariables: () => ({ data: state.rows }),
  useFlowVariablesServiceUpsertFlowVariable: (options: typeof state.upsertOptions) => {
    state.upsertOptions = options;
    return { mutate: state.upsert };
  },
  useFlowVariablesServiceDeleteFlowVariable: (options: typeof state.removeOptions) => {
    state.removeOptions = options;
    return { mutate: state.remove };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [];
});
afterEach(cleanup);
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
    resourceId: 7,
    scope: Scope.RESOURCE,
    key: 'greeting',
    requestBody: { value: 'Hello' },
  });
  act(() => state.upsertOptions.onSuccess());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['variables', 7] });
  expect(state.success).toHaveBeenCalledWith({ title: 'toast.saved.title' });
  expect(screen.queryByText('editor.createTitle')).toBeNull();
});
it('edits existing values without changing their key and reports save failures', async () => {
  state.rows = [{ scope: Scope.RESOURCE, key: 'greeting', valueType: 'string', value: 'Hello', updatedAt: 'Today' }];
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'actions.edit' }));
  expect(screen.getByRole('textbox', { name: 'editor.key' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'editor.value' }), { target: { value: 'Welcome' } });
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.upsert).toHaveBeenCalledWith({
    resourceId: 7,
    scope: Scope.RESOURCE,
    key: 'greeting',
    requestBody: { value: 'Welcome' },
  });
  const error = new Error('Denied');
  act(() => state.upsertOptions.onError(error));
  expect(state.error).toHaveBeenCalledWith(expect.objectContaining({ error }));
  fireEvent.click(screen.getByRole('button', { name: 'actions.cancel' }));
  expect(screen.getByText('greeting')).toBeTruthy();
});
it('requires confirmation before deletion and handles its success and error callbacks', async () => {
  state.rows = [{ scope: Scope.RESOURCE, key: 'old', valueType: 'number', value: 42, updatedAt: 'Today' }];
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
  fireEvent.click(screen.getByRole('button', { name: 'actions.confirmDeleteNo' }));
  expect(state.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
  fireEvent.click(screen.getByRole('button', { name: 'actions.confirmDeleteYes' }));
  expect(state.remove).toHaveBeenCalledWith({ resourceId: 7, scope: Scope.RESOURCE, key: 'old' });
  const error = new Error('Denied');
  act(() => state.removeOptions.onError(error));
  expect(state.error).toHaveBeenCalledWith(expect.objectContaining({ error }));
  act(() => state.removeOptions.onSuccess());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['variables', 7] });
  expect(state.success).toHaveBeenCalledWith({ title: 'toast.deleted.title' });
});
