import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import {
  AttraccessFrontendPlugin,
  RESOURCE_ACTIVE_SESSION_SLOT,
  RESOURCE_LIST_ROW_SLOT,
  RESOURCE_OVERVIEW_SLOT,
  type PluginSlotContribution,
  type PluginSlotContext,
} from '@attraccess/plugins-frontend-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginSlot } from './PluginSlot';
import usePluginState, { PluginManifestWithPlugin } from './plugin.state';

function installContributions(contributions: PluginSlotContribution[]) {
  const plugin = {
    getPluginName: () => 'test-plugin',
    getSlotContributions: () => contributions,
  } as AttraccessFrontendPlugin;

  usePluginState.setState({
    plugins: [{ plugin } as unknown as PluginManifestWithPlugin],
  });
}

describe('PluginSlot resource slots', () => {
  beforeEach(() => {
    usePluginState.setState({ plugins: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [RESOURCE_OVERVIEW_SLOT, { resourceId: 11 }],
    [RESOURCE_ACTIVE_SESSION_SLOT, { resourceId: 11, usageId: 22 }],
    [RESOURCE_LIST_ROW_SLOT, { resourceId: 11 }],
  ])('renders a contribution for %s with its host context', (slotId, context) => {
    const renderContribution = vi.fn((slotContext: PluginSlotContext) => <div>{JSON.stringify(slotContext)}</div>);
    installContributions([{ slotId, render: renderContribution }]);

    render(<PluginSlot slotId={slotId} context={context} />);

    expect(renderContribution).toHaveBeenCalledWith(context);
    expect(screen.getByText(JSON.stringify(context))).toBeInTheDocument();
  });

  it('keeps other contributions usable when a resource contribution throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    installContributions([
      {
        slotId: RESOURCE_OVERVIEW_SLOT,
        key: 'broken',
        render: () => {
          throw new Error('plugin failed');
        },
      },
      {
        slotId: RESOURCE_OVERVIEW_SLOT,
        key: 'working',
        render: () => <div>Working contribution</div>,
      },
    ]);

    render(<PluginSlot slotId={RESOURCE_OVERVIEW_SLOT} context={{ resourceId: 11 }} />);

    expect(screen.getByText('Working contribution')).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(`slot "${RESOURCE_OVERVIEW_SLOT}" contribution "broken"`),
      expect.any(Error),
      expect.any(Object),
    );
  });
});
