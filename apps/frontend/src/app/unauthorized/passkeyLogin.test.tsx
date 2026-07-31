import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PasskeyLogin } from './passkeyLogin';
import { TestWrapper } from '../../test-utils/wrappers';

const startAuthentication = vi.fn();
const createSessionWithPasskey = vi.fn();

// Resolves dotted keys against the translations the component actually passes in, so the test
// runs the real getTranslationKeyForApiError against the real api-errors JSON.
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: ({ en }: { en: Record<string, unknown> }) => {
    const lookup = (key: string) =>
      key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en);

    return {
      t: (key: string) => (typeof lookup(key) === 'string' ? (lookup(key) as string) : key),
      tExists: (key: string) => lookup(key) !== undefined,
    };
  },
}));

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => true,
  startAuthentication: (...args: unknown[]) => startAuthentication(...args),
}));

function apiError(message: string): Error {
  return Object.assign(new Error(message), { body: { message } });
}

vi.mock('@attraccess/react-query-client', () => ({
  ApiError: class ApiError extends Error {},
  UseUsersServiceGetCurrentKeyFn: () => ['currentUser'],
  PasskeysService: {
    getPasskeyAuthenticationOptions: () => Promise.resolve({ options: { challenge: 'c' } }),
    createSessionWithPasskey: (...args: unknown[]) => createSessionWithPasskey(...args),
  },
}));

async function clickSignIn() {
  render(<PasskeyLogin />, { wrapper: TestWrapper });
  await userEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));
}

function errorAlert(): HTMLElement | null {
  return document.querySelector('[data-cy="passkey-login-error-alert"]');
}

describe('PasskeyLogin – error reporting', () => {
  beforeEach(() => {
    startAuthentication.mockReset().mockResolvedValue({ id: 'cred-1', response: {} });
    createSessionWithPasskey.mockReset();
  });

  it('explains that the email is unverified instead of blaming the passkey', async () => {
    createSessionWithPasskey.mockRejectedValue(apiError('UserEmailNotVerifiedException'));

    await clickSignIn();

    await waitFor(() => expect(errorAlert()).toHaveTextContent('Email not verified'));
    expect(errorAlert()).not.toHaveTextContent('Passkey sign in failed');
  });

  it('falls back to the passkey wording for a failure the server does not name', async () => {
    createSessionWithPasskey.mockRejectedValue(apiError('PasskeyUnknownCredential'));

    await clickSignIn();

    await waitFor(() => expect(errorAlert()).toHaveTextContent('Passkey sign in failed'));
  });

  it('stays silent when the user dismisses the system prompt', async () => {
    const dismissed = new Error('dismissed');
    dismissed.name = 'NotAllowedError';
    startAuthentication.mockRejectedValue(dismissed);

    await clickSignIn();

    await waitFor(() => expect(startAuthentication).toHaveBeenCalled());
    expect(errorAlert()).toBeNull();
  });
});
