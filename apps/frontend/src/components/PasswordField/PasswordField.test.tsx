import '@testing-library/jest-dom/vitest';
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasswordField } from './PasswordField';

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key }),
  }))()),
  ...(await (() => ({
    PasswordInput: ({
      label,
      value,
      onValueChange,
    }: {
      label: string;
      value: string;
      onValueChange: (value: string) => void;
    }) => (
      <label>
        {label}
        <input value={value} onChange={(event) => onValueChange(event.target.value)} />
      </label>
    ),
  }))()),
}));

vi.mock('@attraccess/react-query-client', () => ({
  usePasswordPolicyServiceGetPublicPasswordPolicy: () => ({ data: undefined }),
}));

vi.mock('../toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn() }),
}));

vi.mock('../PasswordPolicyHints', () => ({
  PasswordPolicyHints: () => <div data-testid="password-policy-hints" />,
  generateStrongPassword: () => 'GeneratedStrong-12345!',
}));

describe('PasswordField', () => {
  it('shows the password requirements before anything is typed', () => {
    render(<PasswordField value="" onValueChange={vi.fn()} passwordLabel="New password" />);

    expect(screen.getByTestId('password-policy-hints')).toBeInTheDocument();
  });

  it('hides the password requirements when hints are disabled', () => {
    render(<PasswordField value="secret" onValueChange={vi.fn()} hintsHidden />);

    expect(screen.queryByTestId('password-policy-hints')).not.toBeInTheDocument();
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('generates matching password and confirmation values and copies them to the clipboard', async () => {
  const change = vi.fn();
  const confirm = vi.fn();
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  render(
    <PasswordField
      value=""
      onValueChange={change}
      showConfirmation
      confirmationValue=""
      onConfirmationChange={confirm}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'generate' }));
  await waitFor(() => expect(copy).toHaveBeenCalledWith('GeneratedStrong-12345!'));
  expect(change).toHaveBeenCalledWith('GeneratedStrong-12345!');
  expect(confirm).toHaveBeenCalledWith('GeneratedStrong-12345!');
});
it('still generates a password when clipboard copying is denied', async () => {
  const change = vi.fn();
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Denied'));
  render(<PasswordField value="" onValueChange={change} />);
  fireEvent.click(screen.getByRole('button', { name: 'generate' }));
  await waitFor(() => expect(change).toHaveBeenCalledWith('GeneratedStrong-12345!'));
});
