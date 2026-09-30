import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import {
  AttraccessFrontendPlugin,
  RESOURCE_ACTIVE_SESSION_SLOT,
  type PluginSlotContribution,
  type ResourceActiveSessionSlotContext,
} from '@attraccess/plugins-frontend-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import usePluginState, { PluginManifestWithPlugin } from '../../../../plugins/plugin.state';
import { ActiveSessionDisplay } from './index';

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  AttraccessUser: () => null,
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceResourceUsageEndSession: () => ({ mutate: vi.fn(), isPending: false }),
  useResourcesServiceResourceUsageGetActiveSession: () => ({ data: null }),
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn: () => [],
  UseResourcesServiceResourceUsageGetHistoryKeyFn: () => [],
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn(), resetQueries: vi.fn() }) }));
vi.mock('../../../../../components/toastProvider', () => ({ useToastMessage: () => ({ success: vi.fn(), apiError: vi.fn() }) }));
vi.mock('../../../forms/hooks/useResourceFormsSubmission', () => ({
  useResourceFormsSubmission: () => ({ requestForms: () => Promise.resolve([]), modal: null }),
}));
vi.mock('../SessionStatusCard', () => ({ SessionStatusCard: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../SessionTimer', () => ({ SessionTimer: () => null }));
vi.mock('../SessionNotesModal', () => ({ SessionModalMode: { END: 'end' }, SessionNotesModal: () => null }));
vi.mock('./flowButtons', () => ({ FlowButtons: () => null }));

function installContribution(contribution: PluginSlotContribution<ResourceActiveSessionSlotContext>) {
  const plugin = {
    getPluginName: () => 'test-plugin',
    getSlotContributions: () => [contribution],
  } as AttraccessFrontendPlugin;

  usePluginState.setState({ plugins: [{ plugin } as unknown as PluginManifestWithPlugin] });
}

describe('ActiveSessionDisplay plugin slot', () => {
  beforeEach(() => usePluginState.setState({ plugins: [] }));

  it('renders the active-session contribution with resource and usage context', () => {
    const renderContribution = vi.fn(() => <div>Plugin progress</div>);
    installContribution({ slotId: RESOURCE_ACTIVE_SESSION_SLOT, render: renderContribution });

    render(<ActiveSessionDisplay resourceId={11} usageId={22} startTime="2026-08-27T10:00:00.000Z" />);

    expect(screen.getByText('Plugin progress')).toBeInTheDocument();
    expect(renderContribution).toHaveBeenCalledWith({ resourceId: 11, usageId: 22 });
  });
});
