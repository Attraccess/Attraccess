import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RoleWithUsageDto } from '@attraccess/react-query-client';
import { RoleFormDrawer } from './index';
const state = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  close: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  apiError: vi.fn(),
  createOptions: {} as { onSuccess: () => void; onError: (error: unknown) => void },
  updateOptions: {} as { onSuccess: () => void; onError: (error: unknown) => void },
  roleName: (role: { name: string }) => role.name,
  roleDescription: (role: { description: string }) => role.description,
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
}));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, apiError: state.apiError }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: (key: string) => key === 'resources.view' }),
}));
vi.mock('../../../hooks/useRbacCatalogTranslations', () => ({
  useRbacCatalogTranslations: () => ({
    roleName: state.roleName,
    roleDescription: state.roleDescription,
    permissionLabel: (permission: { key: string }) => permission.key,
    permissionCategory: (category: string) => category,
  }),
}));
vi.mock('../../../components/permissionPicker', () => ({
  PermissionPicker: ({
    selectedKeys,
    disabledKeys,
    onChange,
  }: {
    selectedKeys: Set<string>;
    disabledKeys: string[];
    onChange: (keys: Set<string>) => void;
  }) => (
    <div>
      <output>Selected: {[...selectedKeys].sort().join(',')}</output>
      <output>Locked: {disabledKeys.join(',')}</output>
      <button onClick={() => onChange(new Set(['resources.view', 'users.delete']))}>Select permissions</button>
      <button onClick={() => onChange(new Set())}>Clear permissions</button>
    </div>
  ),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useRbacServiceListRolesKey: 'roles',
  useRbacServiceListPermissions: () => ({
    data: [
      { key: 'resources.view', category: 'resources' },
      { key: 'users.delete', category: 'users' },
      { key: 'plugin.custom', category: 'custom' },
    ],
  }),
  useRbacServiceCreateRole: (options: typeof state.createOptions) => {
    state.createOptions = options;
    return { mutate: state.create };
  },
  useRbacServiceUpdateRole: (options: typeof state.updateOptions) => {
    state.updateOptions = options;
    return { mutate: state.update };
  },
}));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
function role(system = false): RoleWithUsageDto {
  return {
    id: 7,
    name: 'Operators',
    description: 'Existing',
    isSystemManaged: system,
    rolePermissions: [{ permissionKey: 'users.delete' }],
    userCount: 2,
  } as RoleWithUsageDto;
}
it('creates a role with trimmed values and prevents granting permissions the actor lacks', async () => {
  render(<RoleFormDrawer isOpen onOpenChange={state.close} role={null} />);
  expect(await screen.findByText('title.create')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'actions.create' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('inputs.name.label'), { target: { value: ' Operators ' } });
  fireEvent.change(screen.getByLabelText('inputs.description.label'), { target: { value: ' Workshop members ' } });
  fireEvent.click(screen.getByText('Select permissions'));
  expect(screen.getByText('Selected: resources.view')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));
  expect(state.create).toHaveBeenCalledWith({
    requestBody: { name: 'Operators', description: 'Workshop members', permissionKeys: ['resources.view'] },
  });
  act(() => state.createOptions.onSuccess());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['roles'] });
  expect(state.success).toHaveBeenCalledWith({ title: 'messages.created' });
  expect(state.close).toHaveBeenCalledWith(false);
});
it('preserves existing locked permissions when clearing selection and saves an editable role', async () => {
  render(<RoleFormDrawer isOpen onOpenChange={state.close} role={role()} />);
  await screen.findByText('title.edit');
  expect(screen.getByLabelText('inputs.name.label')).toHaveValue('Operators');
  fireEvent.click(screen.getByText('Clear permissions'));
  expect(screen.getByText('Selected: users.delete')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.update).toHaveBeenCalledWith({
    id: 7,
    requestBody: { name: 'Operators', description: 'Existing', permissionKeys: ['users.delete'] },
  });
  const failure = new Error('Denied');
  act(() => state.updateOptions.onError(failure));
  expect(state.apiError).toHaveBeenCalledWith(expect.objectContaining({ error: failure, baseTranslationKey: 'api' }));
  expect(state.close).not.toHaveBeenCalled();
  act(() => state.updateOptions.onSuccess());
  expect(state.success).toHaveBeenCalledWith({ title: 'messages.updated' });
  expect(state.close).toHaveBeenCalledWith(false);
});
it('renders system roles as read-only with selected permissions and a close action', async () => {
  render(<RoleFormDrawer isOpen onOpenChange={state.close} role={role(true)} />);
  await screen.findByText('title.view');
  expect(screen.getByText('systemRoleBanner.description')).toBeTruthy();
  expect(screen.getByLabelText('inputs.name.label')).toBeDisabled();
  expect(screen.getByText('users.delete')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'actions.save' })).toBeNull();
  expect(screen.queryByText('Select permissions')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'actions.close' }));
  expect(state.close).toHaveBeenCalledWith(false);
  expect(state.update).not.toHaveBeenCalled();
});
