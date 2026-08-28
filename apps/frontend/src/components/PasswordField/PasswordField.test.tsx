import '@testing-library/jest-dom/vitest';
import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PasswordField } from './PasswordField';

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
}));

vi.mock('@attraccess/react-query-client', () => ({
  usePasswordPolicyServiceGetPublicPasswordPolicy: () => ({ data: undefined }),
}));

vi.mock('../toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn() }),
}));

vi.mock('../PasswordInput', () => ({
  PasswordInput: ({ label, value, onValueChange }: { label: string; value: string; onValueChange: (value: string) => void }) => (
    <label>
      {label}
      <input value={value} onChange={(event) => onValueChange(event.target.value)} />
    </label>
  ),
}));

vi.mock('../PasswordPolicyHints', () => ({
  PasswordPolicyHints: () => <div data-testid="password-policy-hints" />,
  generateStrongPassword: () => 'GeneratedStrong-12345!',
}));

describe('PasswordField', () => {
  it('only shows password strength hints after a password is entered', async () => {
    const user = userEvent.setup();
    const PasswordFieldHarness = () => {
      const [password, setPassword] = useState('');
      return <PasswordField value={password} onValueChange={setPassword} passwordLabel="New password" />;
    };

    render(<PasswordFieldHarness />);

    expect(screen.queryByTestId('password-policy-hints')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('New password'), 'password');

    expect(screen.getByTestId('password-policy-hints')).toBeInTheDocument();
  });
});
