import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

  it('names the row actions menu after the provider and edits from it', async () => {
    const onEdit = vi.fn();
    render(<SSOProvidersTable providers={[provider]} onEdit={onEdit} onDelete={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Company' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(provider);
  });

  it('deletes only after the confirmation', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<SSOProvidersTable providers={[provider]} onEdit={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Company' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).not.toHaveBeenCalled();
    const confirm = await waitFor(() => {
      const element = document.querySelector('[data-cy="sso-provider-delete-confirm-button"]');
      if (!element) throw new Error('no confirmation');
      return element;
    });
    await userEvent.click(confirm);
    expect(onDelete).toHaveBeenCalledWith(7);
  });

  it('names the row actions menu in German', () => {
    useTranslationState.setState({ language: 'de' });
    render(<SSOProvidersTable providers={[provider]} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Aktionen für Company' })).toBeInTheDocument();
  });

  it('keeps quotes and ampersands in the provider name as typed', () => {
    const named = { ...provider, name: `Max's Keycloak & Co` } as SsoProvider;
    render(<SSOProvidersTable providers={[named]} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole('button', { name: `Actions for Max's Keycloak & Co` })).toBeInTheDocument();
  });
});
