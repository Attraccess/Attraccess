import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PasswordInput } from './PasswordInput';

function Harness({ onValueChange }: { onValueChange?: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <>
      <PasswordInput
        label="Current password"
        value={value}
        onChange={setValue}
        onValueChange={onValueChange}
        autoComplete="current-password"
        data-cy="pw"
      />
      <output data-cy="stored">{value}</output>
    </>
  );
}

describe('PasswordInput', () => {
  // Regression: the field used to mask by rewriting its own controlled value,
  // so key-by-key typing accumulated bullet characters into the stored value
  // ('secret' became '•••••t'). A single fireEvent.change would not catch it.
  it('stores the literal characters when typed one key at a time', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);

    await user.type(screen.getByLabelText('Current password'), 'secret');

    expect(screen.getByText('secret')).toBeInTheDocument();
    expect(screen.queryByText(/•/)).not.toBeInTheDocument();
    expect(onValueChange).toHaveBeenLastCalledWith('secret');
  });

  it('masks via the input type and toggles it on reveal and hide', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByLabelText('Current password');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'current-password');
    expect(input).toHaveAttribute('data-cy', 'pw');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('renders the description and the error message', () => {
    render(
      <PasswordInput
        aria-label="New password"
        autoComplete="new-password"
        description="At least 12 characters"
        errorMessage="Too short"
        isInvalid
      />,
    );

    expect(screen.getByText('At least 12 characters')).toBeInTheDocument();
    expect(screen.getByText('Too short')).toBeInTheDocument();
  });
});
