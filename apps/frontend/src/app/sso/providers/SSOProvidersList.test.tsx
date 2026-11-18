import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SSOProvidersList } from './SSOProvidersList';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  browserConfirm: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useGetAllSsoProviders: () => ({ data: [{ id: 7, name: 'Company', type: 'OIDC' }] }),
  useGetAllSsoProvidersKey: 'sso-providers',
  useDeleteOneSsoProvider: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: mocks.success, error: mocks.error }),
}));

async function startDelete() {
  await userEvent.click(screen.getByRole('button', { name: 'Actions for Company' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
}

describe('SSOProvidersList', () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('confirm', mocks.browserConfirm);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('asks in an in-app dialog before deleting and only deletes after confirmation', async () => {
    render(<SSOProvidersList />);

    await startDelete();
    expect(await screen.findByRole('alertdialog', { name: 'Delete Provider' })).toBeInTheDocument();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.browserConfirm).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mocks.mutateAsync).not.toHaveBeenCalled();

    await startDelete();
    await userEvent.click(document.querySelector('[data-cy="sso-provider-delete-confirm-button"]') as HTMLElement);
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ path: { id: 7 } });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mocks.success).toHaveBeenCalled();
  });

  it('keeps the dialog open and reports the failure when deleting fails', async () => {
    mocks.mutateAsync.mockRejectedValueOnce(new Error('Nope'));
    render(<SSOProvidersList />);

    await startDelete();
    await userEvent.click(document.querySelector('[data-cy="sso-provider-delete-confirm-button"]') as HTMLElement);

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.objectContaining({ description: 'Nope' })));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
