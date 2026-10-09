import '@testing-library/jest-dom/vitest';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PasswordResetForm } from './passwordResetForm';
import { TestWrapper } from '../../../test-utils/wrappers';

const state = vi.hoisted(() => ({ locale: 'en', pending: false }));
const requestResetMock = vi.fn();
const goBackMock = vi.fn();
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: (locales: Record<string, Record<string, unknown>>) => {
    const translations = locales[state.locale];
    const t = (key: string) =>
      key
        .split('.')
        .reduce<unknown>(
          (value, part) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined),
          translations,
        ) ?? key;
    return { t };
  },
}));

vi.mock('@attraccess/react-query-client', () => ({
  useUsersServiceRequestPasswordReset: () => ({ mutate: requestResetMock, isPending: state.pending }),
}));

describe('PasswordResetForm labels', () => {
  beforeEach(() => {
    requestResetMock.mockReset();
    goBackMock.mockReset();
    state.locale = 'en';
    state.pending = false;
  });

  it.each(['en', 'de'] as const)('uses descriptive recovery labels in %s', async (language) => {
    state.locale = language;
    render(<PasswordResetForm onGoBack={goBackMock} />, { wrapper: TestWrapper });

    const expectedLabels =
      language === 'en'
        ? { back: 'Back to sign in', email: 'Email address', submit: 'Send password reset link' }
        : { back: 'Zurück zur Anmeldung', email: 'E-Mail-Adresse', submit: 'Passwort-Reset-Link senden' };
    expect(screen.getByRole('button', { name: expectedLabels.back })).toBeInTheDocument();
    expect(screen.getByLabelText(expectedLabels.email)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: expectedLabels.submit })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(expectedLabels.email), 'maker@example.com');
    await user.click(screen.getByRole('button', { name: expectedLabels.submit }));
    expect(requestResetMock).toHaveBeenCalledWith({ requestBody: { email: 'maker@example.com' } });
    await user.click(screen.getByRole('button', { name: expectedLabels.back }));
    expect(goBackMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['en', 'Send password reset link'],
    ['de', 'Passwort-Reset-Link senden'],
  ] as const)('keeps the %s recovery action named while pending', (language, submitLabel) => {
    state.locale = language;
    state.pending = true;
    render(<PasswordResetForm onGoBack={goBackMock} />, { wrapper: TestWrapper });

    const button = screen.getByRole('button', { name: submitLabel });
    expect(button).toBeDisabled();
  });
});
