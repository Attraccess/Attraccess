import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsSaveBar } from '../../../components/SettingsSaveBar';
import { useNetworkRestrictionDrafts } from '../useNetworkRestrictionDrafts';
import { NetworkRestrictionCard } from './NetworkRestrictionCard';

/** The card with its drafts and a save bar, the way the security section wires them. */
function Harness() {
  const drafts = useNetworkRestrictionDrafts();
  return (
    <>
      <NetworkRestrictionCard drafts={drafts} />
      <SettingsSaveBar
        isDirty={drafts.isDirty}
        isSaving={drafts.isSaving}
        isSaveDisabled={drafts.isSaveDisabled}
        onSave={() => void drafts.save()}
        onDiscard={drafts.discard}
      />
    </>
  );
}

const state = vi.hoisted(() => ({
  settings: undefined as unknown,
  matrix: undefined as unknown,
  matrixError: false,
  updateSettings: vi.fn(),
  updateRoleActions: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  invalidate: vi.fn(() => Promise.resolve()),
  setQueryData: vi.fn(),
}));

vi.mock('@attraccess/react-query-client', () => ({
  NetworkIpSource: { CLIENT: 'client', HEADER: 'header' },
  useGetNetworkRestrictionSettings: () => ({ data: state.settings, isLoading: false }),
  useGetNetworkRestrictionRoleActions: () => ({ data: state.matrix, isError: state.matrixError }),
  useUpdateNetworkRestrictionSettings: () => ({ mutateAsync: state.updateSettings, isPending: false }),
  useUpdateNetworkRestrictionRoleActions: () => ({ mutateAsync: state.updateRoleActions, isPending: false }),
  UseGetNetworkRestrictionSettingsKeyFn: () => ['settings'],
  UseGetNetworkRestrictionRoleActionsKeyFn: () => ['role-actions'],
  useGetNetworkRestrictionStatusKey: 'GetNetworkRestrictionStatus',
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate, setQueryData: state.setQueryData }),
}));
vi.mock('../../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error }),
}));
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
    state.matrixError = false;
    state.updateSettings.mockResolvedValue({});
    state.updateRoleActions.mockResolvedValue({});
  });

  it('shows the detected address judged with the saved ranges', () => {
    state.settings = settings({ enabled: true, allowedRanges: ['10.0.0.0/8'] });
    render(<Harness />);
    expect(
      screen.getByText(/saved settings, your address 203\.0\.113\.9 is outside the allowed network/),
    ).toBeInTheDocument();
  });

  it('does not warn about the own address while no ranges are saved', () => {
    render(<Harness />);
    expect(screen.getByText('Your address is 203.0.113.9. No allowed networks are saved yet.')).toBeInTheDocument();
    expect(screen.queryByText(/your address .* is outside the allowed network/)).not.toBeInTheDocument();
  });

  it('blocks Save while switched on with an empty list and says why at the field', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('switch', { name: 'Restrict actions to the local network' }));
    await userEvent.clear(screen.getByTestId('network-ranges'));
    expect(screen.getByText('Enter at least one allowed network while the restriction is on.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('discards the edits', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('switch', { name: 'Restrict actions to the local network' }));
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByRole('switch', { name: 'Restrict actions to the local network' })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('says so when the role table cannot be loaded', () => {
    state.matrix = undefined;
    state.matrixError = true;
    render(<Harness />);
    expect(screen.getByText('The roles could not be loaded. Reload the page to try again.')).toBeInTheDocument();
  });

  it('refreshes the saved settings even when the role table save fails afterwards', async () => {
    state.updateRoleActions.mockRejectedValue({ body: { message: 'Unknown role: 99' } });
    render(<Harness />);
    await userEvent.click(screen.getByRole('switch', { name: 'Restrict actions to the local network' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Allow End session from outside for Member' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Unknown role: 99')).toBeInTheDocument();
    // The card shows the saved settings at once, primed from the response.
    expect(state.setQueryData).toHaveBeenCalledWith(['settings'], {});
    expect(state.error).toHaveBeenCalledWith({
      title: 'Network restriction not saved',
      description: 'Unknown role: 99',
    });
    expect(state.success).not.toHaveBeenCalled();
  });

  it('suggests the private ranges when switching on with an empty list, and saves them', async () => {
    render(<Harness />);
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

  it('shows the server message for a bad range next to the settings and keeps the draft', async () => {
    state.updateSettings.mockRejectedValue({ body: { message: 'Invalid IP address or CIDR range: "10.0.0.0/40"' } });
    render(<Harness />);
    await userEvent.click(screen.getByRole('switch', { name: 'Restrict actions to the local network' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Invalid IP address or CIDR range: "10.0.0.0/40"')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(state.error).toHaveBeenCalledWith({
      title: 'Network restriction not saved',
      description: 'Invalid IP address or CIDR range: "10.0.0.0/40"',
    });
    expect(state.success).not.toHaveBeenCalled();
  });

  it('edits the role table while the restriction is off and saves only the changed roles', async () => {
    render(<Harness />);
    const end = screen.getByRole('checkbox', {
      name: 'Allow End session from outside for Member',
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
    render(<Harness />);
    expect(screen.getByTestId('network-header-name')).toHaveValue('X-Real-Ip');
    expect(screen.getByText(/Only safe if Attraccess can be reached only through the proxy/)).toBeInTheDocument();
  });
});
