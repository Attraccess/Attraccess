// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Table, TableBody, TableCell, TableColumn, TableContent, TableHeader, TableRow } from '@heroui/react';
import { PencilIcon, ShieldIcon, Trash2Icon } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TableActionsColumnHeader } from './TableActionsColumnHeader';
import { TableRowAction, TableRowActions } from './TableRowActions';

afterEach(cleanup);

const edit = (onPress = vi.fn()): TableRowAction => ({
  key: 'edit',
  label: 'Edit',
  icon: PencilIcon,
  onPress,
  'data-cy': 'edit-item',
});
const remove = (onPress = vi.fn()): TableRowAction => ({
  key: 'delete',
  label: 'Delete',
  icon: Trash2Icon,
  tone: 'danger',
  onPress,
  confirm: { title: 'Delete Laser?', message: 'This cannot be undone.', confirmDataCy: 'confirm-delete' },
  'data-cy': 'delete-item',
});

async function openMenu(name = 'Actions for Laser') {
  await userEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('menu');
}

describe('TableRowActions', () => {
  it('opens a menu whose items have labels and icons and runs plain actions', async () => {
    const onEdit = vi.fn();
    render(<TableRowActions itemName="Laser" actions={[edit(onEdit), remove()]} data-cy="row-actions" />);

    const trigger = screen.getByRole('button', { name: 'Actions for Laser' });
    expect(trigger).toHaveAttribute('data-cy', 'row-actions');
    expect(trigger).not.toHaveTextContent(/\w/);

    const menu = await openMenu();
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Edit', 'Delete']);
    for (const item of items) expect(item.querySelector('svg')).not.toBeNull();
    expect(items[0]).toHaveAttribute('data-cy', 'edit-item');

    await userEvent.click(items[0]);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('puts destructive actions in their own last section, styled as danger', async () => {
    render(<TableRowActions itemName="Laser" actions={[remove(), edit()]} />);
    const menu = await openMenu();

    const sections = within(menu).getAllByRole('group');
    expect(sections).toHaveLength(2);
    expect(within(sections[0]).getByRole('menuitem')).toHaveTextContent('Edit');
    const danger = within(sections[1]).getByRole('menuitem');
    expect(danger).toHaveTextContent('Delete');
    expect(danger.className).toContain('menu-item--danger');
    expect(danger.querySelector('svg')?.getAttribute('class')).toContain('text-danger');
  });

  it('renders named sections with headers between the regular and destructive sections', async () => {
    render(
      <TableRowActions
        itemName="Laser"
        sections={[{ key: 'introducer', title: 'Introducer' }]}
        actions={[
          remove(),
          { key: 'revoke', label: 'Revoke introducer', icon: ShieldIcon, tone: 'danger', section: 'introducer' },
          edit(),
        ]}
      />,
    );
    const menu = await openMenu();
    const sections = within(menu).getAllByRole('group');
    expect(sections.map((section) => within(section).getByRole('menuitem').textContent)).toEqual([
      'Edit',
      'Revoke introducer',
      'Delete',
    ]);
    expect(within(sections[1]).getByText('Introducer')).toBeInTheDocument();
  });

  it('leaves hidden actions out and renders nothing without visible actions', async () => {
    const { rerender, container } = render(
      <TableRowActions itemName="Laser" actions={[edit(), { ...remove(), isHidden: true }]} />,
    );
    const menu = await openMenu();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Edit']);

    rerender(<TableRowActions itemName="Laser" actions={[{ ...edit(), isHidden: true }]} />);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Actions for Laser' })).toBeNull());
    expect(container).toBeEmptyDOMElement();
  });

  it('disables pending items', async () => {
    render(<TableRowActions itemName="Laser" actions={[{ ...edit(), isPending: true }]} />);
    const menu = await openMenu();
    expect(within(menu).getByRole('menuitem')).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps the confirmation open after the menu closes and runs the action on confirm', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<TableRowActions itemName="Laser" actions={[edit(), remove(onDelete)]} />);
    const menu = await openMenu();

    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Laser?' });
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(dialog.querySelector('[data-cy="confirm-delete"]') as HTMLElement);
    expect(onDelete).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('cancels a confirmation from the menu without running the action', async () => {
    const onDelete = vi.fn();
    render(<TableRowActions itemName="Laser" actions={[remove(onDelete)]} />);
    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Delete' }));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('does not trigger the row action when the menu is opened or used', async () => {
    const onRowAction = vi.fn();
    const onEdit = vi.fn();
    render(
      <Table>
        <TableContent aria-label="Resources" onRowAction={onRowAction}>
          <TableHeader>
            <TableColumn isRowHeader>Name</TableColumn>
            <TableColumn>
              <TableActionsColumnHeader />
            </TableColumn>
          </TableHeader>
          <TableBody>
            <TableRow id="laser">
              <TableCell>Laser</TableCell>
              <TableCell>
                <TableRowActions itemName="Laser" actions={[edit(onEdit)]} />
              </TableCell>
            </TableRow>
          </TableBody>
        </TableContent>
      </Table>,
    );
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    // Positive control: a click elsewhere in the row does run the row action.
    await userEvent.click(screen.getByText('Laser'));
    expect(onRowAction).toHaveBeenCalledTimes(1);
    onRowAction.mockClear();

    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onRowAction).not.toHaveBeenCalled();
  });

  it('puts focus that falls back to the row after the menu or its confirmation closed onto the trigger', async () => {
    render(
      <table>
        <tbody>
          <tr tabIndex={-1} data-testid="row">
            <td>
              <TableRowActions itemName="Laser" actions={[edit(), remove()]} />
            </td>
          </tr>
        </tbody>
      </table>,
    );
    const trigger = screen.getByRole('button', { name: 'Actions for Laser' });
    const row = screen.getByTestId('row');

    await openMenu();
    await userEvent.keyboard('{Escape}');
    row.focus();
    await waitFor(() => expect(trigger).toHaveFocus());

    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    row.focus();
    await waitFor(() => expect(trigger).toHaveFocus());

    // Focus the user moves elsewhere stays there.
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    expect(outside).toHaveFocus();
    outside.remove();
  });
});
