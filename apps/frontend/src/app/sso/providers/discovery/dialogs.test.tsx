import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthentikDiscoveryDialog } from './authentik';
import { KeycloakDiscoveryDialog } from './keycloak';
const state = vi.hoisted(() => ({
  refetch: vi.fn(),
  query: vi.fn(),
  discovered: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
}));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, apiError: state.error }),
}));
vi.mock('@attraccess/react-query-client', () => {
  const discovery = (...args: unknown[]) => {
    state.query(...args);
    return { refetch: state.refetch };
  };
  return {
    useAuthenticationServiceDiscoverAuthentikOidc: discovery,
    useAuthenticationServiceDiscoverKeycloakOidc: discovery,
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  state.refetch.mockResolvedValue({ data: { issuer: 'https://idp.example.test' } });
});
afterEach(cleanup);
describe.each([
  { name: 'Authentik', Dialog: AuthentikDiscoveryDialog, field: 'applicationName' },
  { name: 'Keycloak', Dialog: KeycloakDiscoveryDialog, field: 'realm' },
])('$name discovery', ({ Dialog, field }) => {
  async function open() {
    render(<Dialog onDiscovery={state.discovered}>{(open) => <button onClick={open}>Configure</button>}</Dialog>);
    fireEvent.click(screen.getByRole('button', { name: 'Configure' }));
    await screen.findByLabelText('host');
  }
  function fill() {
    fireEvent.change(screen.getByLabelText('host'), { target: { value: 'https://idp.example.test' } });
    fireEvent.change(screen.getByLabelText(field), { target: { value: 'workshop' } });
  }
  it('requires both inputs and delivers discovered configuration', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'discover' }));
    expect(state.refetch).not.toHaveBeenCalled();
    fill();
    expect(state.query).toHaveBeenLastCalledWith({ host: 'https://idp.example.test', [field]: 'workshop' }, undefined, {
      enabled: false,
    });
    fireEvent.click(screen.getByRole('button', { name: 'discover' }));
    await waitFor(() => expect(state.discovered).toHaveBeenCalledWith({ issuer: 'https://idp.example.test' }));
    expect(state.refetch).toHaveBeenCalledWith({ throwOnError: true });
    expect(state.success).toHaveBeenCalledWith({ title: 'success.title', description: 'success.description' });
    expect(screen.queryByRole('button', { name: 'discover' })).toBeNull();
  });
  it.each(['missing configuration', 'network failure'])('keeps the dialog open for %s', async (failure) => {
    if (failure === 'missing configuration') state.refetch.mockResolvedValue({ data: undefined });
    else state.refetch.mockRejectedValue(new Error('Offline'));
    await open();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'discover' }));
    await waitFor(() =>
      expect(state.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error), baseTranslationKey: 'api' }),
      ),
    );
    expect(state.discovered).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText('host')).toHaveValue('https://idp.example.test');
    expect(screen.getByRole('button', { name: 'discover' })).not.toBeDisabled();
  });
});
