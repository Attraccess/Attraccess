// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmableButton } from './ConfirmableButton';

afterEach(cleanup);

const confirm = { title: 'Delete token?', message: 'This cannot be undone.', confirmDataCy: 'confirm' };

describe('ConfirmableButton', () => {
  it('opens the dialog instead of running the action, and Cancel closes it', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmableButton label="Delete" status="error" confirm={confirm} onConfirm={onConfirm} data-cy="del" />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete token?' })).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and pending while the action runs, then closes it', async () => {
    let resolve: () => void = () => undefined;
    const onConfirm = vi.fn(() => new Promise<void>((done) => (resolve = done)));
    render(<ConfirmableButton label="Delete" status="error" confirm={confirm} onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('alertdialog').querySelector('[data-cy="confirm"]') as HTMLElement);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled());

    resolve();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('stays open when the action fails so the user can retry', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('nope'));
    render(<ConfirmableButton label="Delete" status="error" confirm={confirm} onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(dialog.querySelector('[data-cy="confirm"]') as HTMLElement);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it.each([
    ['error', true],
    ['warning', false],
    ['info', false],
    ['success', false],
  ] as const)('renders a %s confirmation, danger styled only for errors', async (status, isDanger) => {
    render(
      <ConfirmableButton
        label="Go"
        status={status}
        confirm={{ ...confirm, confirmLabel: 'Yes' }}
        onConfirm={vi.fn()}
        data-cy="go"
      />,
    );
    const activator = screen.getByRole('button', { name: 'Go' });
    expect(activator.className.includes('button--danger')).toBe(isDanger);

    await userEvent.click(activator);
    expect(screen.getByRole('button', { name: 'Yes' }).className.includes('button--danger')).toBe(isDanger);
  });

  it('renders a swapped activator that opens the dialog', async () => {
    render(
      <ConfirmableButton
        label="Remove"
        status="warning"
        confirm={confirm}
        onConfirm={vi.fn()}
        isDisabled
        renderActivator={(open, props) => (
          <a href="#remove" onClick={open} aria-disabled={props.isDisabled}>
            {props.label}
          </a>
        )}
      />,
    );
    const link = screen.getByText('Remove');
    expect(link).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(link);
    expect(screen.getByRole('alertdialog', { name: 'Delete token?' })).toBeInTheDocument();
  });
});
