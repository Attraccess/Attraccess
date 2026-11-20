import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DoorControls } from './DoorControls';

function renderControls(props: { accessOnly?: boolean; separateUnlockAndUnlatch?: boolean }) {
  const handlers = { onLock: vi.fn(), onUnlock: vi.fn(), onUnlatch: vi.fn(), onOpen: vi.fn() };
  render(
    <DoorControls
      {...handlers}
      {...props}
      lockIsPending={false}
      unlockIsPending={false}
      unlatchIsPending={false}
      openIsPending={false}
    />,
  );
  return handlers;
}

describe('DoorControls', () => {
  it('offers a single Open button on an access-only door', () => {
    const { onOpen, onUnlock } = renderControls({ accessOnly: true });

    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('offers lock and unlock on a regular door', () => {
    renderControls({});

    expect(screen.getByRole('button', { name: 'Lock' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
  });

  it('hides Unlatch when the door has no separate unlatch', () => {
    renderControls({ separateUnlockAndUnlatch: false });
    expect(screen.queryByRole('button', { name: 'Unlatch' })).not.toBeInTheDocument();
  });

  it('hides Unlatch when separateUnlockAndUnlatch is omitted', () => {
    renderControls({});
    expect(screen.queryByRole('button', { name: 'Unlatch' })).not.toBeInTheDocument();
  });

  it('shows Unlatch and calls onUnlatch on a door with separate unlatch', () => {
    const { onUnlatch } = renderControls({ separateUnlockAndUnlatch: true });

    fireEvent.click(screen.getByRole('button', { name: 'Unlatch' }));

    expect(onUnlatch).toHaveBeenCalledTimes(1);
  });

  it('hides Unlatch without an onUnlatch handler', () => {
    render(
      <DoorControls
        onLock={vi.fn()}
        onUnlock={vi.fn()}
        onOpen={vi.fn()}
        separateUnlockAndUnlatch
        lockIsPending={false}
        unlockIsPending={false}
        unlatchIsPending={false}
        openIsPending={false}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Unlatch' })).not.toBeInTheDocument();
  });
});
