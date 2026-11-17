import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UpdateResourceDto } from '@attraccess/react-query-client';
import { DoorTab } from './door';

function renderTab(formData: UpdateResourceDto) {
  const setField = vi.fn();
  render(<DoorTab formData={formData} setField={setField} />);
  const separate = screen.getByRole('switch', { name: /^Separate Unlock and Unlatch/ });
  const accessOnly = screen.getByRole('switch', { name: /^Access only/ });
  return { setField, separate, accessOnly };
}

describe('DoorTab', () => {
  it('turns access only on', () => {
    const { setField, accessOnly } = renderTab({ separateUnlockAndUnlatch: false, accessOnly: false });

    fireEvent.click(accessOnly);

    expect(setField).toHaveBeenCalledWith('accessOnly', true);
  });

  it('locks separate unlock and unlatch while the door is access only', () => {
    const { separate, accessOnly } = renderTab({ separateUnlockAndUnlatch: false, accessOnly: true });

    expect(accessOnly).toBeChecked();
    expect(separate).toBeDisabled();
  });

  it('locks access only while the door unlocks and unlatches separately', () => {
    const { separate, accessOnly } = renderTab({ separateUnlockAndUnlatch: true, accessOnly: false });

    expect(separate).toBeChecked();
    expect(accessOnly).toBeDisabled();
  });
});
