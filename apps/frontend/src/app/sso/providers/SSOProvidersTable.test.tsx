import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SsoProvider } from '@attraccess/react-query-client';
import { SSOProvidersTable } from './SSOProvidersTable';
import en from './en.json';
import de from './de.json';

const translations = vi.hoisted(() => ({ language: 'en' as 'en' | 'de' }));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => {
  const { get } = await import('lodash-es');
  return {
    ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
    useTranslations: (strings: Record<'en' | 'de', object>) => ({
      t: (key: string, params?: Record<string, string>) =>
        String(get(strings[translations.language], key, key)).replace(
          /{{(\w+)}}/g,
          (_, name: string) => params?.[name] ?? '',
        ),
    }),
  };
});

const provider = { id: 7, name: 'Company', type: 'OIDC' } as SsoProvider;

describe('SSOProvidersTable', () => {
  afterEach(() => {
    cleanup();
    translations.language = 'en';
  });

  it('names the icon-only row actions after the provider', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<SSOProvidersTable providers={[provider]} onEdit={onEdit} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit Company' }));
    expect(onEdit).toHaveBeenCalledWith(provider);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Company' }));
    expect(onDelete).toHaveBeenCalledWith(7);
  });

  it('names the row actions in German', () => {
    translations.language = 'de';
    render(<SSOProvidersTable providers={[provider]} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Anbieter Company bearbeiten' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anbieter Company löschen' })).toBeInTheDocument();
    expect(en.editProviderLabel).toBe('Edit {{name}}');
    expect(de.deleteProviderLabel).toBe('Anbieter {{name}} löschen');
  });
});
