import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DoorControls } from './DoorControls';

const props = {
  t: (key: string) => key,
  onLock: vi.fn(),
  onUnlock: vi.fn(),
  onUnlatch: vi.fn(),
  lockIsPending: false,
  unlockIsPending: false,
  unlatchIsPending: false,
};

describe('DoorControls', () => {
  it('hides the unlatch action for doors without a separate unlatch function', () => {
    render(<DoorControls {...props} separateUnlockAndUnlatch={false} />);

    expect(screen.queryByRole('button', { name: 'door.unlatch' })).not.toBeInTheDocument();
  });

  it('shows the unlatch action for doors with a separate unlatch function', () => {
    render(<DoorControls {...props} separateUnlockAndUnlatch />);

    expect(screen.getByRole('button', { name: 'door.unlatch' })).toBeInTheDocument();
  });
});
