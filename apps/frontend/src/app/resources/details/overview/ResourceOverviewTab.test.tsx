import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import {
  AttraccessFrontendPlugin,
  RESOURCE_OVERVIEW_SLOT,
  type PluginSlotContribution,
  type ResourceSlotContext,
} from '@attraccess/plugins-frontend-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import usePluginState, { PluginManifestWithPlugin } from '../../../plugins/plugin.state';
import { ResourceOverviewTab } from './ResourceOverviewTab';

vi.mock('react-router-dom', () => ({ useParams: () => ({ id: '11' }) }));
vi.mock('@attraccess/react-query-client', () => ({ useResourcesServiceGetOneResourceById: () => ({ data: {} }) }));
vi.mock('../../usage/resourceUsageSession', () => ({ ResourceUsageSession: () => null }));
vi.mock('../resourceBillingInfo', () => ({ ResourceBillingInfo: () => null }));
vi.mock('./RecentSessionsCard', () => ({ RecentSessionsCard: () => null }));
vi.mock('./ResourceDocsPreviewCard', () => ({ ResourceDocsPreviewCard: () => null }));
vi.mock('./OperatingDurationCard', () => ({ OperatingDurationCard: () => null }));

function installContribution(contribution: PluginSlotContribution<ResourceSlotContext>) {
  const plugin = {
    getPluginName: () => 'test-plugin',
    getSlotContributions: () => [contribution],
  } as AttraccessFrontendPlugin;

  usePluginState.setState({ plugins: [{ plugin } as unknown as PluginManifestWithPlugin] });
}

describe('ResourceOverviewTab plugin slot', () => {
  beforeEach(() => usePluginState.setState({ plugins: [] }));

  it('renders the overview contribution with the resource context', () => {
    const renderContribution = vi.fn(() => <div>Plugin overview</div>);
    installContribution({ slotId: RESOURCE_OVERVIEW_SLOT, render: renderContribution });

    render(<ResourceOverviewTab />);

    expect(screen.getByText('Plugin overview')).toBeInTheDocument();
    expect(renderContribution).toHaveBeenCalledWith({ resourceId: 11 });
  });
});
