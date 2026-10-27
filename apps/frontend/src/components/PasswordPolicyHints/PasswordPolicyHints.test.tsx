import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PublicPasswordPolicy } from '@attraccess/shared';
import { PasswordPolicyHints } from './PasswordPolicyHints';
import { generateStrongPassword } from './generatePassword';
const state = vi.hoisted(() => ({ score: 0 }));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({
    t: (key: string) => key,
  }),
}));
vi.mock('./useZxcvbn', () => ({
  useZxcvbn: () => ({
    result: { score: state.score },
  }),
}));
const policy: PublicPasswordPolicy = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecial: true,
  allowAllUnicode: false,
  minZxcvbnScore: 3,
};
beforeEach(() => {
  state.score = 0;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('marks unsatisfied composition rules and shows server rejection reasons', () => {
  const view = render(
    <PasswordPolicyHints
      password="short"
      username="Ada"
      email="ada@example.test"
      policy={policy}
      serverErrors={[{ code: 'PASSWORD_REUSED', params: { historySize: 5 } }]}
    />,
  );
  expect(view.container.querySelector('[data-cy="password-policy-rule-length"]')).toHaveAttribute(
    'data-satisfied',
    'false',
  );
  expect(view.container.querySelector('[data-cy="password-policy-rule-uppercase"]')).toHaveAttribute(
    'data-satisfied',
    'false',
  );
  expect(view.container.querySelector('[data-cy="password-policy-rule-lowercase"]')).toHaveAttribute(
    'data-satisfied',
    'true',
  );
  expect(screen.getByText('serverErrors.PASSWORD_REUSED')).toBeTruthy();
});
it('marks a strong password as satisfying the rules and omits disabled composition rules', () => {
  state.score = 4;
  const view = render(
    <PasswordPolicyHints
      password="Strong-Passphrase-42!"
      username="Ada"
      email="ada@example.test"
      policy={{ ...policy, allowAllUnicode: true, requireUppercase: false }}
    />,
  );
  expect(view.container.querySelector('[data-cy="password-policy-rule-length"]')).toHaveAttribute(
    'data-satisfied',
    'true',
  );
  expect(view.container.querySelector('[data-cy="password-policy-rule-uppercase"]')).toBeNull();
  expect(view.container.querySelector('[data-cy="password-policy-rule-ascii"]')).toBeNull();
});
it.each([
  [0, 'danger'],
  [1, 'danger'],
  [2, 'warning'],
  [3, 'success'],
  [4, 'success'],
] as const)('shows strength score %s as a %s meter without crack-time details', (score, color) => {
  state.score = score;
  render(<PasswordPolicyHints password="x" username="" email="" policy={policy} />);
  const meter = screen.getByRole('meter', { name: 'strength.label' });
  expect(meter).toHaveAttribute('data-score', String(score));
  expect(meter).toHaveAttribute('aria-valuenow', String(score + 1));
  expect(meter).toHaveAttribute('aria-valuetext', `strength.score.${score}`);
  expect(meter.className).toContain(`meter--${color}`);
  expect(screen.queryByText(/crack/i)).toBeNull();
});
it('generates requested composition and length with a secure randomness source', () => {
  const password = generateStrongPassword({
    length: 32,
    requireUppercase: true,
    requireLowercase: true,
    requireDigit: true,
    requireSpecial: true,
  });
  expect(password).toHaveLength(32);
  expect(password).toMatch(/[A-Z]/);
  expect(password).toMatch(/[a-z]/);
  expect(password).toMatch(/[2-9]/);
  expect(password).toMatch(/[^A-Za-z0-9]/);
  expect(generateStrongPassword({ length: 4 })).toHaveLength(16);
  expect(generateStrongPassword()).toHaveLength(20);
});
it('fails explicitly when secure randomness is unavailable', () => {
  vi.stubGlobal('crypto', undefined);
  expect(() => generateStrongPassword()).toThrow('Web Crypto-capable environment');
});
