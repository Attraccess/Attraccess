import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MqttServerList } from './MqttServerList';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@attraccess/react-query-client', () => ({
  useMqttServersGetAllKey: 'MqttServersGetAll',
  useMqttServersGetAll: () => ({
    data: [{ id: 3, name: 'Broker & Co', host: 'mqtt.local', port: 1883 }],
    isLoading: false,
    error: null,
  }),
  useMqttServersDeleteOne: () => ({ mutateAsync: mocks.mutateAsync }),
}));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: mocks.success, error: mocks.error }),
}));
vi.mock('../../plugins/PluginSlot', () => ({ PluginSlot: () => <span data-testid="row-slot" /> }));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mocks.navigate,
}));

function renderList() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <MqttServerList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openMenuItem(name: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Actions for Broker & Co' }));
  await userEvent.click(await screen.findByRole('menuitem', { name }));
}

describe('MqttServerList', () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset().mockResolvedValue(undefined);
    mocks.navigate.mockReset();
  });
  afterEach(cleanup);

  it('renders the plugin slot next to the name, not in the actions cell', () => {
    renderList();
    const nameCell = screen.getByText('Broker & Co').closest('[role="rowheader"], [role="gridcell"]');
    expect(within(nameCell as HTMLElement).getByTestId('row-slot')).toBeInTheDocument();
  });

  it('opens the editor from the menu', async () => {
    renderList();
    await openMenuItem('Edit server');
    expect(mocks.navigate).toHaveBeenCalledWith('/devices/mqtt/servers/3');
  });

  it('deletes a server only after the confirmation, which names it', async () => {
    renderList();
    await openMenuItem('Delete server');
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Broker & Co?' });
    expect(mocks.mutateAsync).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mocks.mutateAsync).not.toHaveBeenCalled();

    await openMenuItem('Delete server');
    await screen.findByRole('alertdialog');
    await userEvent.click(
      document.querySelector('[data-cy="mqtt-server-list-delete-confirmation-delete-button"]') as HTMLElement,
    );
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ path: { id: 3 } });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
