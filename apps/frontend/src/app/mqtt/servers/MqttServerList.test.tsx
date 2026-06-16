import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MqttServerList } from './MqttServerList';

const hoisted = vi.hoisted(() => ({
  servers: [
    {
      id: 1,
      name: 'Local Broker',
      host: '127.0.0.1',
      port: 1883,
    },
  ],
  connectionStates: [] as { serverId: number; status: 'disconnected' | 'unknown'; lastError?: string | null }[],
  deleteMutate: vi.fn(),
  invalidateQueries: vi.fn(),
  successToast: vi.fn(),
  errorToast: vi.fn(),
}));

vi.mock('@attraccess/react-query-client', () => ({
  useMqttServiceMqttServersGetAll: () => ({ data: hoisted.servers, isLoading: false, error: null }),
  useMqttServiceMqttServersGetStatusOfAll: () => ({ data: hoisted.connectionStates }),
  useMqttServiceMqttServersDeleteOne: () => ({ mutate: hoisted.deleteMutate, isPending: false }),
  useMqttServiceMqttServersGetAllKey: 'MqttServiceMqttServersGetAll',
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: hoisted.invalidateQueries }),
}));

vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: hoisted.successToast, error: hoisted.errorToast }),
}));

vi.mock('../../plugins/PluginSlot', () => ({
  PluginSlot: () => null,
}));

const renderList = () => render(<MqttServerList />, { wrapper: MemoryRouter });

describe('MqttServerList', () => {
  beforeEach(() => {
    hoisted.connectionStates.length = 0;
    vi.clearAllMocks();
  });

  it('updates the status chip when the status query data changes in place', () => {
    const { rerender } = renderList();

    expect(screen.getByText('Unknown')).toBeInTheDocument();

    hoisted.connectionStates.push({
      serverId: 1,
      status: 'disconnected',
      lastError: 'connect ECONNREFUSED 127.0.0.1:1883',
    });
    rerender(<MqttServerList />);

    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });
});
