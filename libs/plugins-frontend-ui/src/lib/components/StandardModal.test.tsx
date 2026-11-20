// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModalHeading } from '@heroui/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { StandardModal } from './StandardModal';

function pressResponderWarnings(...spies: MockInstance[]) {
  return spies
    .flatMap((spy) => spy.mock.calls)
    .filter((args) => args.some((arg) => String(arg).includes('PressResponder')));
}

function ControlledModal(props: { isDismissable?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open</button>
      <StandardModal
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        data-cy="standard-modal"
        backdropProps={props.isDismissable === undefined ? undefined : { isDismissable: props.isDismissable }}
      >
        {({ close }) => (
          <>
            <ModalHeading>Variables</ModalHeading>
            <button onClick={close}>Done</button>
          </>
        )}
      </StandardModal>
    </>
  );
}

describe('StandardModal', () => {
  let warn: MockInstance;
  let error: MockInstance;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn');
    error = vi.spyOn(console, 'error');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens and closes through isOpen and onOpenChange and puts data-cy on the DOM', async () => {
    render(<ControlledModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog', { name: 'Variables' })).toBeInTheDocument();
    expect(document.querySelector('[data-cy="standard-modal"]')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('stays open on an outside click when backdropProps turn dismissal off', async () => {
    render(<ControlledModal isDismissable={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));

    await userEvent.click(document.querySelector('[data-slot="modal-backdrop"]') as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'Variables' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('maps an overlay state to isOpen and onOpenChange', async () => {
    const setOpen = vi.fn();
    render(
      <StandardModal state={{ isOpen: true, setOpen, open: vi.fn(), close: vi.fn(), toggle: vi.fn() }}>
        <ModalHeading>From state</ModalHeading>
      </StandardModal>,
    );
    expect(screen.getByRole('dialog', { name: 'From state' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it('logs no PressResponder warning, closed or open', async () => {
    render(<ControlledModal />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(pressResponderWarnings(warn, error)).toEqual([]);
  });
});
