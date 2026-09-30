import type { ComponentProps } from 'react';
import type { RoleWithUsageDto } from '@attraccess/react-query-client';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RolesPage } from './index';
import { RolesSection } from '../settings/sections/roles';
import { DeleteRoleModal } from './delete-role-modal';
import type { RoleFormDrawer } from './role-form-drawer';
const state = vi.hoisted(() => ({
  roles: [] as RoleWithUsageDto[],
  loading: false,
  remove: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  apiError: vi.fn(),
  callbacks: undefined as undefined | { onSuccess: () => void; onError: (error: Error) => void },
}));
vi.mock('@attraccess/react-query-client', () => ({
  useRbacServiceListRoles: () => ({ data: state.roles, isLoading: state.loading }),
  useRbacServiceListPermissions: () => ({ data: [] }),
  useRbacServiceListRolesKey: 'roles',
  useRbacServiceDeleteRole: (callbacks: typeof state.callbacks) => {
    state.callbacks = callbacks;
    return { mutate: state.remove, isPending: false };
  },
}));
vi.mock('../../hooks/useRbacCatalogTranslations', () => ({
  useRbacCatalogTranslations: () => ({
    roleName: (role: RoleWithUsageDto) => role.name,
    roleDescription: (role: RoleWithUsageDto) => role.description,
    permissionLabel: ({ key }: { key: string }) => key,
  }),
}));
vi.mock('../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, apiError: state.apiError }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('./role-form-drawer', () => ({
  RoleFormDrawer: ({ isOpen, role, onOpenChange }: ComponentProps<typeof RoleFormDrawer>) =>
    isOpen ? (
      <section aria-label="Role editor">
        {role?.name ?? 'New role'}
        <button onClick={() => onOpenChange(false)}>Close editor</button>
      </section>
    ) : null,
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.loading = false;
  state.roles = [
    {
      id: 1,
      key: 'custom',
      name: 'Workshop member',
      description: 'Can use tools',
      isSystemManaged: false,
      isDefault: false,
      rolePermissions: [],
      userCount: 2,
    },
    {
      id: 2,
      key: 'system',
      name: 'System member',
      description: '',
      isSystemManaged: true,
      isDefault: true,
      userCount: 0,
    },
  ];
});
afterEach(cleanup);
it.each([RolesPage, RolesSection])(
  'renders system and custom roles with appropriate edit/delete controls (%#)',
  async (Component) => {
    render(
      <MemoryRouter>
        <Component />
      </MemoryRouter>,
    );
    expect(screen.getByText('Workshop member')).toBeTruthy();
    expect(screen.getByText('Can use tools')).toBeTruthy();
    const customEdit = document.querySelector('[data-cy="roles-table-edit-custom"]');
    expect(customEdit).toBeTruthy();
    fireEvent.click(customEdit!);
    expect(screen.getByRole('region', { name: 'Role editor' })).toHaveTextContent('Workshop member');
    fireEvent.click(screen.getByText('Close editor'));
    fireEvent.click(document.querySelector('[data-cy="roles-table-edit-system"]')!);
    expect(screen.getByRole('region', { name: 'Role editor' })).toHaveTextContent('System member');
    fireEvent.click(screen.getByText('Close editor'));
    expect(document.querySelector('[data-cy="roles-table-delete-system"]')).toBeNull();
    fireEvent.click(document.querySelector('[data-cy="roles-table-delete-custom"]')!);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Workshop member');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /Create role/i }));
    expect(screen.getByRole('region', { name: 'Role editor' })).toHaveTextContent('New role');
  },
);
it('opens permissions and users from settings role counts', () => {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<RolesSection />} />
        <Route path="/users" element={<p>User directory</p>} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(document.querySelector('[data-cy="roles-table-permissions-custom"]')!);
  expect(screen.getByRole('region', { name: 'Role editor' })).toHaveTextContent('Workshop member');
  fireEvent.click(screen.getByText('Close editor'));
  fireEvent.click(document.querySelector('[data-cy="roles-table-users-custom"]')!);
  expect(screen.getByText('User directory')).toBeTruthy();
});
it('requires a replacement before reassigning users and excludes the deleted role from choices', async () => {
  const close = vi.fn();
  render(<DeleteRoleModal isOpen role={state.roles[0]} allRoles={state.roles} onClose={close} />);
  fireEvent.click(screen.getByRole('radio', { name: /Reassign to another role/ }));
  expect(screen.getByRole('button', { name: 'Delete role' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /Select a role/ }));
  expect(screen.queryByRole('option', { name: 'Workshop member' })).toBeNull();
  fireEvent.click(await screen.findByRole('option', { name: 'System member' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete role' }));
  expect(state.remove).toHaveBeenCalledWith({ id: 1, reassignToRoleId: 2 });
  act(() => state.callbacks?.onSuccess());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['roles'] });
  expect(state.success).toHaveBeenCalledWith({ title: 'Role deleted' });
  expect(close).toHaveBeenCalledOnce();
});
it('removes assignments by default and keeps errors open for retry', () => {
  const close = vi.fn();
  render(<DeleteRoleModal isOpen role={state.roles[0]} allRoles={state.roles} onClose={close} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete role' }));
  expect(state.remove).toHaveBeenCalledWith({ id: 1, reassignToRoleId: undefined });
  const error = new Error('Forbidden');
  act(() => state.callbacks?.onError(error));
  expect(state.apiError).toHaveBeenCalledWith(
    expect.objectContaining({ error, baseTranslationKey: 'api', fallbackKey: 'generic' }),
  );
  expect(close).not.toHaveBeenCalled();
});
it('omits reassignment when no users are affected and renders nothing without a role', () => {
  const view = render(<DeleteRoleModal isOpen role={state.roles[1]} allRoles={state.roles} onClose={vi.fn()} />);
  expect(screen.getByText('No users are currently assigned to this role.')).toBeTruthy();
  expect(screen.queryByRole('radio')).toBeNull();
  view.unmount();
  render(<DeleteRoleModal isOpen role={null} allRoles={state.roles} onClose={vi.fn()} />);
  expect(screen.queryByRole('dialog')).toBeNull();
});
