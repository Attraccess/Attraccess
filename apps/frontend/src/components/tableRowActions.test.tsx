import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Edit3Icon, Trash2Icon } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { TableRowActions } from './tableRowActions';

describe('TableRowActions', () => {
  it('renders row actions behind a three-dot menu and invokes selected actions', async () => {
    const edit = vi.fn();
    const remove = vi.fn();

    render(
      <TableRowActions
        ariaLabel="Actions"
        actions={[
          {
            key: 'edit',
            label: 'Edit',
            icon: <Edit3Icon className="w-4 h-4" />,
            onPress: edit,
          },
          {
            key: 'delete',
            label: 'Delete',
            icon: <Trash2Icon className="w-4 h-4" />,
            variant: 'destructive',
            onPress: remove,
          },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /edit/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));

    await userEvent.click(screen.getByRole('menuitem', { name: /edit/i }));
    expect(edit).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    const deleteItem = screen.getByRole('menuitem', { name: /delete/i });
    expect(deleteItem).toHaveClass('text-danger');

    await userEvent.click(deleteItem);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
