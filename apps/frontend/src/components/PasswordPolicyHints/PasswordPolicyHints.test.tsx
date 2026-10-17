import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PublicPasswordPolicy } from '@attraccess/shared';
import { PasswordPolicyHints } from './PasswordPolicyHints';
import { generateStrongPassword } from './generatePassword';
const state = vi.hoisted(() => ({ score: 0, seconds: 0 }));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({
    t: (key: string, params?: { value?: number }) => (params?.value === undefined ? key : `${key}:${params.value}`),
  }),
}));
vi.mock('./useZxcvbn', () => ({
  useZxcvbn: () => ({
    result: { score: state.score, crackTimes: { offlineSlowHashingXPerSecond: { seconds: state.seconds } } },
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
  state.seconds = 0;
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
  expect(screen.getByText('strength.minRequired')).toBeTruthy();
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
  expect(screen.queryByText('strength.minRequired')).toBeNull();
});
it.each([
  [0, 'crack.instant'],
  [30, 'crack.seconds:30'],
  [120, 'crack.minutes:2'],
  [7200, 'crack.hours:2'],
  [172800, 'crack.days:2'],
  [5184000, 'crack.months:2'],
  [63072000, 'crack.years:2'],
  [3153600000, 'crack.centuries'],
  [Infinity, 'crack.centuries'],
] as const)('formats the estimated crack duration %s', (seconds, text) => {
  state.seconds = seconds;
  render(<PasswordPolicyHints password="" username="" email="" policy={policy} />);
  expect(screen.getByText(`strength.crackTime: ${text}`)).toBeTruthy();
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
