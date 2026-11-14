import { ApiError } from '@attraccess/react-query-client';
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
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key }),
  }))()),
}));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error }),
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => {
  const { ApiError } = await importOriginal<typeof import('@attraccess/react-query-client')>();
  const discovery = (...args: unknown[]) => {
    state.query(...args);
    return { refetch: state.refetch };
  };
  return {
    ApiError,
    useAuthenticationServiceDiscoverAuthentikOidc: discovery,
    useAuthenticationServiceDiscoverKeycloakOidc: discovery,
  };
});
const serverMessage = 'Discovery URL could not be reached: https://idp.example.test (ECONNREFUSED)';
const badGateway = (body: unknown) =>
  new ApiError(
    { method: 'GET', url: '/discovery' },
    { url: '/discovery', ok: false, status: 502, statusText: 'Bad Gateway', body },
    'Bad Gateway',
  );
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
      retry: false,
    });
    fireEvent.click(screen.getByRole('button', { name: 'discover' }));
    await waitFor(() => expect(state.discovered).toHaveBeenCalledWith({ issuer: 'https://idp.example.test' }));
    expect(state.refetch).toHaveBeenCalledWith({ throwOnError: true });
    expect(state.success).toHaveBeenCalledWith({ title: 'success.title', description: 'success.description' });
    expect(screen.queryByRole('button', { name: 'discover' })).toBeNull();
  });
  it.each([
    ['the server message of a JSON error body', badGateway({ statusCode: 502, message: serverMessage }), serverMessage],
    [
      'the fallback for a proxy HTML page',
      badGateway('<html><body>502 Bad Gateway</body></html>'),
      'error.unreachable',
    ],
    ['the fallback for a missing error body', badGateway(undefined), 'error.unreachable'],
    ['the fallback for a network error', new TypeError('Failed to fetch'), 'error.unreachable'],
    ['the fallback for missing configuration', undefined, 'error.unreachable'],
  ])('shows %s and keeps the dialog open', async (_, failure, description) => {
    if (failure) state.refetch.mockRejectedValue(failure);
    else state.refetch.mockResolvedValue({ data: undefined });
    await open();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'discover' }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith({ title: 'error.title', description }));
    expect(state.discovered).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText('host')).toHaveValue('https://idp.example.test');
    expect(screen.getByRole('button', { name: 'discover' })).not.toBeDisabled();
  });
});
