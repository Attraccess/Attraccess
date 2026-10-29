// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusDialog } from './index';

afterEach(cleanup);

describe('StatusDialog', () => {
  it('shows a notice with a single close button', async () => {
    const onClose = vi.fn();
    render(
      <StatusDialog isOpen onClose={onClose} status="success" title="Introduction complete" data-cy="notice">
        You've been introduced to Laser Cutter.
      </StatusDialog>,
    );

    expect(screen.getByRole('alertdialog', { name: 'Introduction complete' })).toBeInTheDocument();
    expect(screen.getByText("You've been introduced to Laser Cutter.")).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers a destructive action next to Cancel for errors and keeps it open while the action runs', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <StatusDialog
        isOpen
        onClose={onClose}
        status="error"
        title="Confirm Deletion"
        action={{ label: 'Delete', onPress: onConfirm, 'data-cy': 'delete-button' }}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();

    rerender(
      <StatusDialog
        isOpen
        onClose={onClose}
        status="error"
        title="Confirm Deletion"
        action={{ label: 'Delete', onPress: onConfirm, isPending: true }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('renders nothing while closed', () => {
    render(<StatusDialog isOpen={false} onClose={vi.fn()} status="info" title="Hidden" />);

    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('styles the action as danger for errors and primary for every other status', () => {
    const statuses = ['error', 'warning', 'info', 'success', 'default'] as const;
    for (const status of statuses) {
      const { unmount } = render(
        <StatusDialog isOpen onClose={vi.fn()} status={status} title="T" action={{ label: 'Go', onPress: vi.fn() }} />,
      );
      const expected = status === 'error' ? 'button--danger' : 'button--primary';
      expect(screen.getByRole('button', { name: 'Go' }).className).toContain(expected);
      unmount();
    }
  });

  it('closes on Escape but not on a backdrop click', async () => {
    const onClose = vi.fn();
    render(<StatusDialog isOpen onClose={onClose} status="warning" title="Careful" data-cy="warn" />);

    const dialog = screen.getByRole('alertdialog');
    const backdrop =
      dialog.closest('[data-slot="alert-dialog-backdrop"], [data-react-aria-top-layer]') ?? document.body;
    await userEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape while the action is pending', async () => {
    const onClose = vi.fn();
    render(
      <StatusDialog
        isOpen
        onClose={onClose}
        status="error"
        title="Deleting"
        action={{ label: 'Delete', onPress: vi.fn(), isPending: true }}
      />,
    );

    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });
});
