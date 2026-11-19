import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SsoProvider } from '@attraccess/react-query-client';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { SSOProvidersTable } from './SSOProvidersTable';

const provider = { id: 7, name: 'Company', type: 'OIDC' } as SsoProvider;

describe('SSOProvidersTable', () => {
  afterEach(() => {
    cleanup();
    useTranslationState.setState({ language: 'en' });
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
    useTranslationState.setState({ language: 'de' });
    render(<SSOProvidersTable providers={[provider]} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Anbieter Company bearbeiten' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anbieter Company löschen' })).toBeInTheDocument();
  });

  it('keeps quotes and ampersands in the provider name as typed', () => {
    const named = { ...provider, name: `Max's Keycloak & Co` } as SsoProvider;
    render(<SSOProvidersTable providers={[named]} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole('button', { name: `Edit Max's Keycloak & Co` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Delete Max's Keycloak & Co` })).toBeInTheDocument();
  });
});
