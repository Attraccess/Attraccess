import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkRestrictionCard } from './NetworkRestrictionCard';

const state = vi.hoisted(() => ({
  settings: undefined as unknown,
  matrix: undefined as unknown,
  updateSettings: vi.fn(),
  updateRoleActions: vi.fn(),
  success: vi.fn(),
  invalidate: vi.fn(() => Promise.resolve()),
}));

vi.mock('@attraccess/react-query-client', () => ({
  NetworkIpSource: { CLIENT: 'client', HEADER: 'header' },
  useGetNetworkRestrictionSettings: () => ({ data: state.settings, isLoading: false }),
  useGetNetworkRestrictionRoleActions: () => ({ data: state.matrix }),
  useUpdateNetworkRestrictionSettings: () => ({ mutateAsync: state.updateSettings, isPending: false }),
  useUpdateNetworkRestrictionRoleActions: () => ({ mutateAsync: state.updateRoleActions, isPending: false }),
  UseGetNetworkRestrictionSettingsKeyFn: () => ['settings'],
  UseGetNetworkRestrictionRoleActionsKeyFn: () => ['role-actions'],
  useGetNetworkRestrictionStatusKey: 'GetNetworkRestrictionStatus',
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../../../../../components/toastProvider', () => ({ useToastMessage: () => ({ success: state.success }) }));
vi.mock('../../../../../hooks/useRbacCatalogTranslations', () => ({
  useRbacCatalogTranslations: () => ({ roleName: (role: { name: string }) => role.name }),
}));

const settings = (over = {}) => ({
  enabled: false,
  allowedRanges: [],
  ipSource: 'client',
  headerName: 'X-Real-Ip',
  detectedAddress: '203.0.113.9',
  detectedInside: false,
  ...over,
});
const matrix = {
  actions: ['usage.start', 'usage.end'],
  roles: [{ roleId: 4, key: 'member', name: 'Member', actions: ['usage.start'] }],
};

describe('NetworkRestrictionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.settings = settings();
    state.matrix = matrix;
    state.updateSettings.mockResolvedValue({});
    state.updateRoleActions.mockResolvedValue({});
  });

  it('shows the detected address and whether it is inside the allowed ranges', () => {
    render(<NetworkRestrictionCard />);
    expect(screen.getByText(/203\.0\.113\.9.*outside the allowed network/)).toBeInTheDocument();
  });

  it('suggests the private ranges when switching on with an empty list, and saves them', async () => {
    render(<NetworkRestrictionCard />);
    await userEvent.click(screen.getByRole('switch', { name: 'Restrict actions to the local network' }));
    expect((screen.getByTestId('network-ranges') as HTMLTextAreaElement).value).toContain('192.168.0.0/16');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(state.updateSettings).toHaveBeenCalledTimes(1));
    expect(state.updateSettings.mock.calls[0][0].body).toMatchObject({
      enabled: true,
      ipSource: 'client',
      allowedRanges: expect.arrayContaining(['10.0.0.0/8', '192.168.0.0/16', 'fc00::/7']),
    });
    expect(state.updateRoleActions).not.toHaveBeenCalled();
    await waitFor(() => expect(state.success).toHaveBeenCalled());
  });

  it('shows the server message for a bad range inline and keeps the draft', async () => {
    state.updateSettings.mockRejectedValue({ body: { message: 'Invalid IP address or CIDR range: "10.0.0.0/40"' } });
    render(<NetworkRestrictionCard />);
    await userEvent.click(screen.getByRole('switch', { name: 'Restrict actions to the local network' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Invalid IP address or CIDR range: "10.0.0.0/40"')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(state.success).not.toHaveBeenCalled();
  });

  it('edits the role table while the restriction is off and saves only the changed roles', async () => {
    render(<NetworkRestrictionCard />);
    const end = screen.getByRole('checkbox', {
      name: 'Allow End from outside for Member',
    });
    await userEvent.click(end);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(state.updateRoleActions).toHaveBeenCalledTimes(1));
    expect(state.updateRoleActions.mock.calls[0][0].body).toEqual({
      roles: [{ roleId: 4, actions: ['usage.start', 'usage.end'] }],
    });
    expect(state.updateSettings).not.toHaveBeenCalled();
  });

  it('asks for the header name in header mode and warns about forged headers', async () => {
    state.settings = settings({ ipSource: 'header' });
    render(<NetworkRestrictionCard />);
    expect(screen.getByTestId('network-header-name')).toHaveValue('X-Real-Ip');
    expect(screen.getByText(/Only safe if Attraccess can be reached only through the proxy/)).toBeInTheDocument();
  });
});
