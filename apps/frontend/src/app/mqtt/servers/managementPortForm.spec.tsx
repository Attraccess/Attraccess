import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateMqttServerForm } from './CreateMqttServerPage';
import { EditMqttServerPage } from './EditMqttServerPage';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  server: {
    id: 7,
    name: 'Broker',
    host: 'broker.example',
    port: 1883,
    managementPort: 18083 as number | null | undefined,
  },
}));

vi.mock('@attraccess/react-query-client', () => ({
  useMqttServiceMqttServersCreateOne: () => ({ mutate: mocks.create, isPending: false }),
  useMqttServiceMqttServersUpdateOne: () => ({ mutate: mocks.update, isPending: false }),
  useMqttServiceMqttServersGetOneById: () => ({ data: mocks.server, isLoading: false, isError: false }),
  useMqttServiceMqttServersGetAllKey: 'mqtt-servers',
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: ({ en }: { en: Record<string, unknown> }) => ({ t: (key: string) => en[key] ?? key }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ serverId: '7' }), useNavigate: () => vi.fn() }));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../../components/pageHeader', () => ({ PageHeader: () => null }));
vi.mock('../../../components/select', () => ({ Select: () => null }));
vi.mock('../../../components/labeledSwitch', () => ({ LabeledSwitch: () => null }));
vi.mock('../../../components/PasswordInput', () => ({ PasswordInput: () => null }));
vi.mock('./TlsSection', () => ({ TlsSection: () => null }));
vi.mock('../../plugins/PluginSlot', () => ({ PluginSlot: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.server.managementPort = 18083;
});
afterEach(cleanup);

describe.each(['create', 'edit'] as const)('%s MQTT management port', (mode) => {
  function setup() {
    const { container } = render(mode === 'create' ? <CreateMqttServerForm /> : <EditMqttServerPage />);
    const input = screen.getByRole('spinbutton', { name: 'Management Port (Optional)' });
    const form = container.querySelector('form');
    if (!form) throw new Error('MQTT form missing');
    return { input, form, mutate: mode === 'create' ? mocks.create : mocks.update };
  }

  it('uses an optional integer input and initializes the saved value', () => {
    const { input } = setup();
    expect(input).toHaveAttribute('min', '1');
    expect(input).toHaveAttribute('max', '65535');
    expect(input).toHaveAttribute('step', '1');
    expect(input).not.toBeRequired();
    expect(input).toHaveValue(mode === 'create' ? null : 18083);
  });

  it.each(['1', '65535', '18084'])('submits %s as a number without changing the MQTT port', (value) => {
    const { input, form, mutate } = setup();
    fireEvent.change(input, { target: { value } });
    fireEvent.submit(form);
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ managementPort: Number(value), port: 1883 }),
      }),
    );
  });

  it('preserves the initial management port on an unrelated save', () => {
    const { form, mutate } = setup();
    fireEvent.submit(form);
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ managementPort: mode === 'create' ? null : 18083 }),
      }),
    );
  });

  it('submits null when cleared', () => {
    const { input, form, mutate } = setup();
    fireEvent.change(input, { target: { value: '18084' } });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.submit(form);
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ managementPort: null }),
      }),
    );
  });

  it.each(['0', '-1', '65536', '1.5'])('blocks submission of %s even for a direct submit event', (value) => {
    const { input, form, mutate } = setup();
    fireEvent.change(input, { target: { value } });
    fireEvent.submit(form);
    expect(mutate).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});

it.each([null, undefined])('renders an unset saved management port (%s) as empty', (managementPort) => {
  mocks.server.managementPort = managementPort;
  render(<EditMqttServerPage />);
  expect(screen.getByRole('spinbutton', { name: 'Management Port (Optional)' })).toHaveValue(null);
});
