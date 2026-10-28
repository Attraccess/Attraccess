// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { PasswordInput } from '@attraccess/plugins-frontend-ui';

// Vitest runs without globals here, so testing-library's auto-cleanup is off.
afterEach(cleanup);

function Harness() {
  const [value, setValue] = useState('');
  return (
    <>
      <PasswordInput label="Current password" value={value} onChange={setValue} autoComplete="off" data-cy="pw" />
      <output data-cy="stored">{value}</output>
    </>
  );
}

describe('PasswordInput in plugin forms', () => {
  // Regression: the field used to mask by rewriting its own controlled value,
  // so key-by-key typing accumulated bullet characters into the stored value
  // ('secret' became '•••••t'). A single fireEvent.change would not catch it.
  it('stores the literal characters when typed one key at a time', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText('Current password'), 'secret');

    expect(screen.getByText('secret')).toBeInTheDocument();
    expect(screen.queryByText(/•/)).not.toBeInTheDocument();
  });

  it('masks via the input type and toggles it on reveal', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByLabelText('Current password');
    expect(input).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
  });
});
