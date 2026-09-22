import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CsvInvite } from './index';
const state = vi.hoisted(() => ({
  file: undefined as File | undefined,
  invite: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  options: {} as { onSuccess: () => void; onError: (error: unknown) => void },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useRbacServiceListRoles: () => ({ data: [{ key: 'member' }] }),
  useUsersServiceFindManyKey: 'users',
  useUsersServiceInviteUsersFromCsv: (options: typeof state.options) => {
    state.options = options;
    return { mutate: state.invite };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.file = undefined;
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
    if (this.type === 'file') fireEvent.change(this, { target: { files: state.file ? [state.file] : [] } });
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function map(label: string, option: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(label + '$') }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
}
it('requires a file and field mapping before submitting', () => {
  render(<CsvInvite />);
  fireEvent.click(screen.getByRole('button', { name: 'actions.invite' }));
  expect(state.invite).not.toHaveBeenCalled();
  expect(state.error).toHaveBeenCalledWith(expect.objectContaining({ title: 'errors.missingConfig.title' }));
  fireEvent.click(screen.getByRole('button', { name: 'inputs.file' }));
  expect(state.invite).not.toHaveBeenCalled();
});
it('parses a real CSV preview, maps identity and role columns, skips distinct rejected rows, and refreshes users', async () => {
  state.file = new File(
    ['\uFEFFemail,user,role\r\nada@example.test,Ada,member\r\nben@example.test,Ben,member\r\n'],
    'people.csv',
    { type: 'text/csv' },
  );
  const done = vi.fn();
  const failed = vi.fn();
  render(<CsvInvite onSuccess={done} onError={failed} />);
  fireEvent.click(screen.getByRole('button', { name: 'inputs.file' }));
  await screen.findByRole('button', { name: /inputs.fieldMapping.roleKeyColumn$/ });
  await map('inputs.fieldMapping.email', 'email');
  await map('inputs.fieldMapping.username', 'user');
  await map('inputs.fieldMapping.roleKeyColumn', 'role');
  expect(await screen.findByText('ada@example.test')).toBeTruthy();
  expect(screen.getByText('Ada')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'actions.invite' }));
  expect(state.invite).toHaveBeenLastCalledWith({
    formData: {
      file: state.file,
      config: { emailKey: 'email', usernameKey: 'user', roleKeyColumn: 'role', ignoredRows: [] },
    },
  });
  const error = {
    body: {
      errors: [
        { row: 2, field: 'email', message: 'Invalid address', value: 'ada@example.test' },
        { row: 2, field: 'username', message: 'Duplicate username' },
        { row: 3, message: 'Rejected row' },
      ],
    },
  };
  act(() => state.options.onError(error));
  expect(failed).toHaveBeenCalledWith(error);
  expect(screen.getByText('Invalid address')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'actions.inviteIgnore' }));
  expect(state.invite).toHaveBeenLastCalledWith({
    formData: {
      file: state.file,
      config: { emailKey: 'email', usernameKey: 'user', roleKeyColumn: 'role', ignoredRows: [2, 3] },
    },
  });
  act(() => state.options.onSuccess());
  expect(done).toHaveBeenCalledOnce();
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['users'] });
  expect(screen.queryByText('Invalid address')).toBeNull();
});
it('clears preview data for malformed CSV and propagates errors without row details', async () => {
  state.file = new File(['email,user\n"unterminated'], 'invalid.csv', { type: 'text/csv' });
  const failed = vi.fn();
  render(<CsvInvite onError={failed} />);
  fireEvent.click(screen.getByRole('button', { name: 'inputs.file' }));
  await screen.findByRole('button', { name: 'invalid.csv' });
  await waitFor(() => expect(screen.queryByRole('button', { name: /inputs.fieldMapping.roleKeyColumn$/ })).toBeNull());
  const error = new Error('Network unavailable');
  act(() => state.options.onError(error));
  expect(failed).toHaveBeenCalledWith(error);
  expect(screen.queryByText('errors.title')).toBeNull();
});
