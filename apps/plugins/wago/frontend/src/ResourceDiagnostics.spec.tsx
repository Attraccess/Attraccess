/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AttraccessFrontendPluginAuthData } from '@attraccess/plugins-frontend-sdk';
import WagoPlugin from './plugin';
import { ControllerDiagnostics } from './ControllerDiagnostics';

const mockRequest = jest.fn();
jest.mock('./styles.css', () => ({}));
jest.mock('./ControllersPage', () => ({ ControllersPage: () => null }));
jest.mock('@attraccess/plugins-frontend-sdk', () => ({
  ...jest.requireActual('@attraccess/plugins-frontend-sdk'),
  createPluginApiClient: () => ({ request: (...args: unknown[]) => mockRequest(...args) }),
}));
jest.mock('./ControllerDiagnostics', () => ({
  ...jest.requireActual('./ControllerDiagnostics'),
  ControllerDiagnostics: jest.fn(({ controllerId }: { controllerId: number }) => <p>Details {controllerId}</p>),
}));
jest.mock('@heroui/react', () => ({
  Button: ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) => (
    <button onClick={onPress}>{children}</button>
  ),
}));

const auth = (permissions: string[]) =>
  ({ user: { effectivePermissions: permissions } }) as unknown as AttraccessFrontendPluginAuthData;
const result = {
  resourceId: 42,
  truncated: false,
  invalidControllerReferences: 0,
  controllers: [
    {
      controllerId: 7,
      name: 'Relay',
      unavailable: false,
      referencesTruncated: false,
      references: [{ nodeId: 'node', href: '/resources/42/flows?node=node', invalid: true, conflict: true }],
    },
  ],
};

function mount(slot = 'resource.overview', allowed = true) {
  const plugin = new WagoPlugin();
  plugin.onApiAuthStateChange(auth(allowed ? ['resources.update'] : []));
  const contributions = plugin.getSlotContributions();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <button>Host start usage</button>
      {contributions.find((entry) => entry.slotId === slot)?.render({ resourceId: 42, usageId: 8 })}
    </QueryClientProvider>,
  );
  return { plugin, client, ...view };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequest.mockResolvedValue(result);
});

it('registers only the overview slot and loads only resource references until opened', async () => {
  expect(new WagoPlugin().getSlotContributions().map((entry) => entry.slotId)).toEqual(['resource.overview']);
  const { unmount } = mount();
  const open = await screen.findByText('Open WAGO diagnostics: Relay');
  expect(mockRequest).toHaveBeenCalledWith(
    '/resources/42/diagnostics',
    expect.objectContaining({ signal: expect.anything() }),
  );
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(ControllerDiagnostics).not.toHaveBeenCalled();
  fireEvent.click(open);
  expect(screen.getByText('Details 7')).toBeTruthy();
  fireEvent.click(screen.getByText('Close WAGO diagnostics: Relay'));
  expect(screen.queryByText('Details 7')).toBeNull();
  expect(screen.getByText('Host start usage')).toBeTruthy();
  unmount();
});

it('does not fetch for ordinary users and removes cached details on permission loss', async () => {
  const { plugin } = mount('resource.overview', false);
  expect(mockRequest).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Resource WAGO diagnostics')).toBeNull();
  act(() => plugin.onApiAuthStateChange(auth(['resources.update'])));
  fireEvent.click(await screen.findByText('Open WAGO diagnostics: Relay'));
  act(() => plugin.onApiAuthStateChange(null));
  expect(screen.queryByText('Details 7')).toBeNull();
  expect(screen.queryByLabelText('Resource WAGO diagnostics')).toBeNull();
});

it('renders nothing for unrelated resources', async () => {
  mockRequest.mockResolvedValue({ ...result, controllers: [] });
  const { client } = mount();
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(screen.queryByLabelText('Resource WAGO diagnostics')).toBeNull();
});

it('shows actionable references and incomplete lookup warnings without disabling usage', async () => {
  mockRequest.mockResolvedValue({
    ...result,
    truncated: true,
    invalidControllerReferences: 2,
    controllers: [{ ...result.controllers[0], unavailable: true, referencesTruncated: true }],
  });
  mount();
  expect((await screen.findByText('Review node node')).getAttribute('href')).toBe('/resources/42/flows?node=node');
  expect(screen.getByText(/Channel also controlled/)).toBeTruthy();
  expect(screen.getByText(/lookup incomplete/)).toBeTruthy();
  expect(screen.getByText(/Showing at most/)).toBeTruthy();
  expect(screen.getByText(/Invalid controller references: 2/)).toBeTruthy();
  expect(screen.getByText('Host start usage').hasAttribute('disabled')).toBe(false);
});

it('isolates request failures and hides cached references after a failed refresh', async () => {
  const { client } = mount();
  await screen.findByText('Open WAGO diagnostics: Relay');
  mockRequest.mockRejectedValue(new Error('denied'));
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['wago', 'resource-diagnostics', 42] });
  });
  expect(await screen.findByText(/WAGO diagnostics unavailable/)).toBeTruthy();
  expect(screen.queryByText('Open WAGO diagnostics: Relay')).toBeNull();
  expect(screen.getByText('Host start usage')).toBeTruthy();
});

it('isolates malformed contribution data from host controls', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    mockRequest.mockResolvedValue({ controllers: [null] });
    mount();
    expect(await screen.findByText(/Diagnostics could not be displayed/)).toBeTruthy();
    expect(screen.getByText('Host start usage')).toBeTruthy();
  } finally {
    error.mockRestore();
  }
});
