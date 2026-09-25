import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PasswordResetForm } from './passwordResetForm';
import { TestWrapper } from '../../../test-utils/wrappers';

const locale = vi.hoisted(() => ({ current: 'en' }));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: (locales: Record<string, Record<string, unknown>>) => {
    const translations = locales[locale.current];
    const t = (key: string) => key.split('.').reduce<unknown>(
      (value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined,
      translations,
    ) ?? key;
    return { t };
  },
}));

vi.mock('@attraccess/react-query-client', () => ({
  useUsersServiceRequestPasswordReset: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('PasswordResetForm labels', () => {
  beforeEach(() => {
    locale.current = 'en';
  });

  it.each(['en', 'de'] as const)('uses descriptive recovery labels in %s', (language) => {
    locale.current = language;
    render(<PasswordResetForm onGoBack={vi.fn()} />, { wrapper: TestWrapper });

    const expectedLabels = language === 'en'
      ? { back: 'Back to sign in', email: 'Email address', submit: 'Reset password' }
      : { back: 'Zurück zur Anmeldung', email: 'E-Mail-Adresse', submit: 'Passwort zurücksetzen' };
    expect(screen.getByRole('button', { name: expectedLabels.back })).toBeInTheDocument();
    expect(screen.getByLabelText(expectedLabels.email)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: expectedLabels.submit })).toBeInTheDocument();
  });
});
