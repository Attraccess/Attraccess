import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import {
  AttraccessFrontendPlugin,
  RESOURCE_LIST_ROW_SLOT,
  type PluginSlotContribution,
  type ResourceSlotContext,
} from '@attraccess/plugins-frontend-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import usePluginState, { PluginManifestWithPlugin } from '../app/plugins/plugin.state';
import { ResourceListItem } from './ResourceListItem';

vi.mock('./ResourceImage', () => ({ ResourceImage: () => null }));
vi.mock('../app/resourceOverview/resourceGroupCard/statusChip', () => ({ StatusChip: () => null }));

function installContribution(contribution: PluginSlotContribution<ResourceSlotContext>) {
  const plugin = {
    getPluginName: () => 'test-plugin',
    getSlotContributions: () => [contribution],
  } as AttraccessFrontendPlugin;

  usePluginState.setState({ plugins: [{ plugin } as unknown as PluginManifestWithPlugin] });
}

describe('ResourceListItem plugin slot', () => {
  beforeEach(() => usePluginState.setState({ plugins: [] }));

  it('renders the list-row contribution with the resource context', () => {
    const renderContribution = vi.fn(() => <div>Plugin status</div>);
    installContribution({ slotId: RESOURCE_LIST_ROW_SLOT, render: renderContribution });

    render(<ResourceListItem resource={{ id: 11, name: 'Laser' }} onPress={vi.fn()} />);

    expect(screen.getByText('Plugin status')).toBeInTheDocument();
    expect(renderContribution).toHaveBeenCalledWith({ resourceId: 11 });
  });
});
