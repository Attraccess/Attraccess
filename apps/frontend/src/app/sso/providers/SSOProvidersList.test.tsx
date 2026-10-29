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
  useAuthenticationServiceGetAllSsoProviders: () => ({ data: [{ id: 7, name: 'Company', type: 'OIDC' }] }),
  useAuthenticationServiceGetAllSsoProvidersKey: 'sso-providers',
  useAuthenticationServiceDeleteOneSsoProvider: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: mocks.success, error: mocks.error }),
}));
vi.mock('./SSOProvidersTable', () => ({
  SSOProvidersTable: ({ onDelete }: { onDelete: (id: number) => void }) => (
    <button onClick={() => onDelete(7)}>Delete row</button>
  ),
}));

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

    await userEvent.click(screen.getByText('Delete row'));
    expect(await screen.findByRole('alertdialog', { name: 'Delete Provider' })).toBeInTheDocument();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.browserConfirm).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mocks.mutateAsync).not.toHaveBeenCalled();

    await userEvent.click(screen.getByText('Delete row'));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ id: 7 });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mocks.success).toHaveBeenCalled();
  });

  it('keeps the dialog open and reports the failure when deleting fails', async () => {
    mocks.mutateAsync.mockRejectedValueOnce(new Error('Nope'));
    render(<SSOProvidersList />);

    await userEvent.click(screen.getByText('Delete row'));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.objectContaining({ description: 'Nope' })));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
