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

const network = vi.hoisted(() => ({ restricted: new Set<string>() }));
const session = vi.hoisted(() => ({ own: null as null | { id: number } }));
vi.mock('./SessionProjectSection', () => ({ SessionProjectSection: () => <div>project section</div> }));
vi.mock('../../../../../hooks/useNetworkRestriction', () => ({
  useNetworkRestriction: () => ({ isRestricted: (action: string) => network.restricted.has(action) }),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    AttraccessUser: () => null,
    useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
  }))()),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useResourceUsageEndSession: () => ({ mutate: vi.fn(), isPending: false }),
  useResourceUsageGetActiveSession: () => ({ data: session.own ? { usage: session.own } : null }),
  UseResourceUsageGetActiveSessionKeyFn: () => [],
  UseResourceUsageGetHistoryKeyFn: () => [],
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), resetQueries: vi.fn() }),
}));
vi.mock('../../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), apiError: vi.fn() }),
}));
vi.mock('../../../forms/hooks/useResourceFormsSubmission', () => ({
  useResourceFormsSubmission: () => ({
    requestForms: () => Promise.resolve([]),
    modal: null,
    clearFormsDraft: vi.fn(),
  }),
}));
vi.mock('../SessionStatusCard', () => ({
  SessionStatusCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
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
  beforeEach(() => {
    usePluginState.setState({ plugins: [] });
    network.restricted = new Set();
    session.own = null;
  });

  // In the fixed-height dashboard tile only what comes first is visible without scrolling.
  it('keeps End Session above the project of the session', () => {
    session.own = { id: 22 };
    render(<ActiveSessionDisplay resourceId={11} usageId={22} startTime="2026-08-27T10:00:00.000Z" />);

    const end = screen.getByRole('button', { name: 'endSession' });
    expect(end.compareDocumentPosition(screen.getByText('project section'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('renders the active-session contribution with resource and usage context', () => {
    const renderContribution = vi.fn(() => <div>Plugin progress</div>);
    installContribution({ slotId: RESOURCE_ACTIVE_SESSION_SLOT, render: renderContribution });

    render(<ActiveSessionDisplay resourceId={11} usageId={22} startTime="2026-08-27T10:00:00.000Z" />);

    expect(screen.getByText('Plugin progress')).toBeInTheDocument();
    expect(renderContribution).toHaveBeenCalledWith({ resourceId: 11, usageId: 22 });
  });

  it('keeps End visible but disabled outside the allowed network, and says why', () => {
    network.restricted = new Set(['usage.end']);
    render(<ActiveSessionDisplay resourceId={11} usageId={22} startTime="2026-08-27T10:00:00.000Z" />);

    expect(screen.getByRole('button', { name: 'endSession' })).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent('onlyLocal');
  });

  it('shows End enabled and no hint while ending is allowed from here', () => {
    render(<ActiveSessionDisplay resourceId={11} usageId={22} startTime="2026-08-27T10:00:00.000Z" />);

    expect(screen.getByRole('button', { name: 'endSession' })).toBeEnabled();
    expect(screen.queryByRole('note')).toBeNull();
  });
});
