import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { PermissionPicker } from './index';
const permissions = [
  { key: 'resources.read', label: 'Read resources', description: 'View resource details', category: 'resources' },
  { key: 'resources.update', label: 'Edit resources', description: 'Edit resource details', category: 'resources' },
  { key: 'users.read', label: 'Read users', description: 'View accounts', category: 'users' },
];
afterEach(cleanup);
function Picker({
  changed,
  presentation = 'drawer',
}: {
  changed: (value: string[]) => void;
  presentation?: 'drawer' | 'autocomplete';
}) {
  const [selected, setSelected] = useState(new Set(['resources.read']));
  return (
    <PermissionPicker
      permissions={permissions}
      selectedKeys={selected}
      disabledKeys={['resources.read']}
      onChange={(keys) => {
        const next = Array.from(keys, String);
        setSelected(new Set(next));
        changed(next);
      }}
      label="Permissions"
      placeholder="Choose permissions"
      searchPlaceholder="Search permissions"
      emptyMessage="No matching permissions"
      lockedHint="Inherited permissions are locked"
      permissionLabel={(p) => p.label}
      permissionDescription={(p) => p.description}
      permissionCategory={(c) => c}
      presentation={presentation}
      drawerTitle="Edit permissions"
      drawerApplyLabel="Apply"
      drawerCancelLabel="Cancel"
      drawerSelectCategoryLabel="Select category"
      drawerClearCategoryLabel="Clear category"
    />
  );
}
it('keeps edits local until Apply and preserves inherited permissions during category changes', async () => {
  const changed = vi.fn();
  render(<Picker changed={changed} />);
  fireEvent.click(screen.getByRole('button', { name: 'Permissions' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /resources/ }));
  const locked = within(dialog).getByRole('checkbox', { name: /^Read resources/ }) as HTMLInputElement;
  expect(locked.disabled).toBe(true);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Select category' }));
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Clear category' }));
  expect(locked.checked).toBe(true);
  fireEvent.click(within(dialog).getByRole('checkbox', { name: /^Edit resources/ }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
  expect(changed).toHaveBeenCalledExactlyOnceWith(['resources.read', 'resources.update']);
});
it('discards cancelled drafts and reopens with the saved selection', async () => {
  const changed = vi.fn();
  render(<Picker changed={changed} />);
  fireEvent.click(screen.getByRole('button', { name: 'Permissions' }));
  let dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /resources/ }));
  fireEvent.click(within(dialog).getByRole('checkbox', { name: /^Edit resources/ }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Permissions' }));
  dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /resources/ }));
  expect((within(dialog).getByRole('checkbox', { name: /^Edit resources/ }) as HTMLInputElement).checked).toBe(false);
});
it('filters autocomplete options and retains locked selections', async () => {
  const changed = vi.fn();
  render(<Picker changed={changed} presentation="autocomplete" />);
  fireEvent.click(screen.getByRole('button', { name: /Permissions/ }));
  const search = await screen.findByPlaceholderText('Search permissions');
  expect(screen.getByText('Inherited permissions are locked')).toBeTruthy();
  fireEvent.change(search, { target: { value: 'Edit resources' } });
  const option = await screen.findByRole('option', { name: /Edit resources/ });
  fireEvent.click(option);
  expect(changed).toHaveBeenLastCalledWith(['resources.read', 'resources.update']);
});
