// Covers the revision history page.
// FEATURE: WAGO controller history keeps rejection details, acknowledgement and rollback protections.
// These flows were once exercised through the removed configuration editor; the history page is now their only entry.
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryPage } from '../src/front-panel/HistoryPage';

const api = vi.hoisted(() => ({
  getDraft: vi.fn(),
  list: vi.fn(),
  preview: vi.fn(),
  acknowledge: vi.fn(),
  rollback: vi.fn(),
}));
vi.mock('../src/api/client', async (original) => ({
  ...(await original<typeof import('../src/api/client')>()),
  getDraft: api.getDraft,
  listConfigurationRevisions: api.list,
  previewConfigurationRevision: api.preview,
  acknowledgeConfigurationRejection: api.acknowledge,
  rollbackConfiguration: api.rollback,
}));

const channel = {
  id: 'output',
  physicalPointId: 'relay',
  profile: 'generic-digital-output',
  capabilities: ['output'],
  disconnectPolicy: { mode: 'hold' },
};
const second = { ...channel, id: 'output2', physicalPointId: 'relay2' };
const oneChannel = {
  version: 1,
  physicalPoints: [{ id: 'relay', hardwareProfile: '751-9301', channel: 0 }],
  logicalChannels: [channel],
};
const twoChannels = {
  version: 1,
  physicalPoints: [...oneChannel.physicalPoints, { id: 'relay2', hardwareProfile: '751-9301', channel: 1 }],
  logicalChannels: [channel, second],
};
const names = { editor: { names: { output: 'Laser power', output2: 'Air assist' }, presets: [] } };
const draft = {
  controllerId: 1,
  snapshot: JSON.stringify(oneChannel),
  presetProvenance: JSON.stringify(names),
  updatedAt: '2026-09-30T10:00:00.000Z',
  reviewedHash: 'reviewed',
};
const revision = (number: number, state: string, extra: Record<string, unknown> = {}) => ({
  revision: number,
  contentHash: `hash-${number}`,
  state,
  rejectionErrors: null,
  publishedAt: '2026-09-30T10:00:00.000Z',
  reportedAt: state === 'pending' ? null : '2026-09-30T10:01:00.000Z',
  ...extra,
});
const rejectionErrors = JSON.stringify([
  {
    path: '$.logicalChannels[1]',
    code: 'unsupported_capability',
    message: 'The controller cannot drive this channel.',
  },
]);
const previewOf = (number: number, extra: Record<string, unknown> = {}) => ({
  draftHash: 'draft-hash',
  revision: {
    ...revision(number, 'applied'),
    snapshot: JSON.stringify(twoChannels),
    presetProvenance: draft.presetProvenance,
  },
  current: {
    ...revision(3, 'applied'),
    snapshot: JSON.stringify(oneChannel),
    presetProvenance: draft.presetProvenance,
  },
  diff: [{ path: '$.logicalChannels[1]', previous: undefined, current: second }],
  metadataDiff: [],
  impacts: [],
  ...extra,
});
const impact = {
  channelId: 'output2',
  message: 'Channel removed. Existing flow references may fail.',
  references: [{ resourceId: 4, flowId: null, nodeId: 'node-1', nodeType: 'plugin.wago.command' }],
};

let client: QueryClient;
function renderHistory(path = '/wago/controllers/1/configuration/history') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/wago/controllers/:controllerId/configuration/history" element={<HistoryPage />} />
          <Route path="/wago/controllers/:controllerId/configuration" element={<p>Front panel</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
const revisionSection = async (number: number) =>
  within(await screen.findByRole('region', { name: `Revision ${number}` }));

beforeEach(() => {
  vi.clearAllMocks();
  useTranslationState.getState().setLanguage('en');
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  api.getDraft.mockResolvedValue(draft);
  api.list.mockResolvedValue({
    revisions: [revision(3, 'applied'), revision(2, 'rejected', { rejectionErrors }), revision(1, 'applied')],
    offset: 0,
    limit: 20,
  });
  api.preview.mockImplementation(async (_id: number, number: number) => previewOf(number));
  api.acknowledge.mockResolvedValue(revision(2, 'rejected', { rejectionAcknowledgedAt: '2026-09-30T10:02:00.000Z' }));
  api.rollback.mockResolvedValue(revision(4, 'pending'));
});
afterEach(() => {
  cleanup();
  client.clear();
});

describe('revision history page', () => {
  it('lists every revision with its state and the reasons the controller rejected one', async () => {
    renderHistory();
    expect(await screen.findByText(/Revision 3 · Applied by controller/)).toBeTruthy();
    expect(screen.getByText(/Revision 2 · Rejected by controller/)).toBeTruthy();
    expect(screen.getByText(/Revision 1 · Applied by controller/)).toBeTruthy();
    // The rejected path resolves to the channel's name from the saved draft, and the message stays literal.
    expect(await (await revisionSection(2)).findByText(/The controller cannot drive this channel\./)).toBeTruthy();
    expect((await revisionSection(2)).getByText(/Air assist/)).toBeTruthy();
    expect((await revisionSection(3)).queryByText(/Acknowledge rejection/)).toBeNull();
  });

  it('shows a pending revision as not yet reported', async () => {
    api.list.mockResolvedValue({ revisions: [revision(5, 'pending')], offset: 0, limit: 20 });
    renderHistory();
    expect(await screen.findByText(/Revision 5 · Pending delivery/)).toBeTruthy();
    expect(screen.getByText(/Reported: Not yet reported/)).toBeTruthy();
  });

  it('shows a readable message when no revision was published yet', async () => {
    api.list.mockResolvedValue({ revisions: [], offset: 0, limit: 20 });
    renderHistory();
    expect(await screen.findByText('No published revisions.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Newer revisions' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Older revisions' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows the load error instead of a blank list', async () => {
    api.list.mockRejectedValue(new Error('Controller unreachable'));
    renderHistory();
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load history: Controller unreachable');
  });

  it('pages through the revision list twenty at a time', async () => {
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, index) => revision(from - index, 'applied'));
    api.list.mockImplementation(async (_id: number, offset: number) =>
      offset === 0 ? { revisions: page(25, 20), offset, limit: 20 } : { revisions: page(5, 5), offset, limit: 20 },
    );
    renderHistory();
    expect(await screen.findByText(/Revision 25 · Applied/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Older revisions' }));
    expect(await screen.findByText(/Revision 5 · Applied/)).toBeTruthy();
    expect(api.list).toHaveBeenLastCalledWith(1, 20);
    expect(screen.getByRole('button', { name: 'Older revisions' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Newer revisions' }));
    expect(await screen.findByText(/Revision 25 · Applied/)).toBeTruthy();
    expect(api.list).toHaveBeenLastCalledWith(1, 0);
  });

  it('acknowledges a rejection once and then shows who acknowledged it', async () => {
    api.acknowledge.mockImplementation(async () => {
      // The page must reload the list itself after a successful acknowledgement.
      api.list.mockResolvedValue({
        revisions: [
          revision(2, 'rejected', {
            rejectionErrors,
            rejectionAcknowledgedAt: '2026-09-30T10:02:00.000Z',
            rejectionAcknowledgedBy: 7,
          }),
        ],
        offset: 0,
        limit: 20,
      });
      return revision(2, 'rejected', { rejectionAcknowledgedAt: '2026-09-30T10:02:00.000Z' });
    });
    renderHistory();
    fireEvent.click(await screen.findByRole('button', { name: 'Acknowledge rejection of revision 2' }));
    await waitFor(() => expect(api.acknowledge).toHaveBeenCalledWith(1, 2, 'hash-2', '2026-09-30T10:01:00.000Z'));
    expect(await screen.findByText('Rejection acknowledged by user 7.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Acknowledge rejection of revision 2' })).toBeNull();
  });

  it('reports a failed acknowledgement without losing the list', async () => {
    api.acknowledge.mockRejectedValue(new Error('The report changed'));
    renderHistory();
    fireEvent.click(await screen.findByRole('button', { name: 'Acknowledge rejection of revision 2' }));
    expect((await screen.findByRole('alert')).textContent).toBe('The report changed');
    expect(screen.getByText(/Revision 3 · Applied by controller/)).toBeTruthy();
  });

  it('falls back to a generic message when a failure carries no text', async () => {
    api.acknowledge.mockRejectedValue('boom');
    renderHistory();
    fireEvent.click(await screen.findByRole('button', { name: 'Acknowledge rejection of revision 2' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Configuration operation failed.');
  });

  it('says when the rejection details cannot be read', async () => {
    api.list.mockResolvedValue({
      revisions: [revision(2, 'rejected', { rejectionErrors: '{"not":"a list"}' })],
      offset: 0,
      limit: 20,
    });
    renderHistory();
    expect(await screen.findByText('Controller rejection details could not be read.')).toBeTruthy();
  });

  it('says when the rejected revision cannot be loaded for its details', async () => {
    api.preview.mockRejectedValue(new Error('gone'));
    renderHistory();
    expect(await screen.findByText('Could not load rejected field details: gone')).toBeTruthy();
  });

  it('returns to the front panel and rejects an invalid controller id', async () => {
    renderHistory();
    fireEvent.click(await screen.findByRole('button', { name: 'Inputs & outputs' }));
    expect(await screen.findByText('Front panel')).toBeTruthy();
    cleanup();
    renderHistory('/wago/controllers/0/configuration/history');
    expect((await screen.findByRole('alert')).textContent).toBe('Invalid controller.');
  });
});

describe('rollback from the history page', () => {
  it('previews what changes and leaves everything untouched when cancelled', async () => {
    renderHistory();
    fireEvent.click(await (await revisionSection(1)).findByRole('button', { name: 'Preview rollback to revision 1' }));
    expect(await screen.findByText('Restore revision 1 as a new revision')).toBeTruthy();
    expect(api.preview).toHaveBeenCalledWith(1, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel rollback' }));
    await waitFor(() => expect(screen.queryByText('Restore revision 1 as a new revision')).toBeNull());
    expect(api.rollback).not.toHaveBeenCalled();
  });

  it('publishes a rollback without an impact acknowledgement when no flow references the change', async () => {
    renderHistory();
    fireEvent.click(await (await revisionSection(1)).findByRole('button', { name: 'Preview rollback to revision 1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Publish rollback as new revision' }));
    await waitFor(() => expect(api.rollback).toHaveBeenCalledWith(1, 1, false, 'hash-1', 'hash-3', 'draft-hash'));
    await waitFor(() => expect(screen.queryByText('Restore revision 1 as a new revision')).toBeNull());
    // The saved draft is read again so the front panel shows the restored configuration.
    await waitFor(() => expect(api.getDraft.mock.calls.length).toBeGreaterThan(1));
  });

  it('requires the impact acknowledgement before publishing a rollback that breaks flow references', async () => {
    api.preview.mockResolvedValue(previewOf(1, { impacts: [impact] }));
    renderHistory();
    fireEvent.click(await (await revisionSection(1)).findByRole('button', { name: 'Preview rollback to revision 1' }));
    expect(await screen.findByText(/Air assist: Channel removed/)).toBeTruthy();
    expect(screen.getByText(/Resource 4, node node-1 \(plugin\.wago\.command\)/)).toBeTruthy();
    const publish = screen.getByRole('button', { name: 'Publish rollback as new revision' });
    expect(publish.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /I checked the affected channel references/ }));
    await waitFor(() => expect(publish.hasAttribute('disabled')).toBe(false));
    fireEvent.click(publish);
    await waitFor(() => expect(api.rollback).toHaveBeenCalledWith(1, 1, true, 'hash-1', 'hash-3', 'draft-hash'));
  });

  it('blocks a rollback the server would refuse and lists the fields to fix', async () => {
    api.preview.mockResolvedValue(
      previewOf(1, {
        errors: [
          {
            path: '$.logicalChannels[1]',
            code: 'unsupported_capability',
            message: 'The controller cannot drive this channel.',
          },
        ],
      }),
    );
    renderHistory();
    fireEvent.click(await (await revisionSection(1)).findByRole('button', { name: 'Preview rollback to revision 1' }));
    const title = await screen.findByText(
      'This revision cannot be published again. Fix these fields in a new draft instead.',
    );
    const alert = within(title.parentElement as HTMLElement);
    // The field is named after the channel, never by its raw JSON path.
    expect(alert.getByText(/Air assist/)).toBeTruthy();
    expect(alert.getByText(/The controller cannot drive this channel\./)).toBeTruthy();
    expect(alert.queryByText(/\$\.logicalChannels/)).toBeNull();
    const publish = screen.getByRole('button', { name: 'Publish rollback as new revision' });
    expect(publish.hasAttribute('disabled')).toBe(true);
    fireEvent.click(publish);
    // Let a mutation that might have started reach its request before checking that none did.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.rollback).not.toHaveBeenCalled();
  });

  // The history page does not show the rollback error yet (HistoryPage ignores the failure passed to onRollback);
  // this only pins the draft reconciliation that must happen either way.
  it('still refreshes the draft after a failed rollback', async () => {
    api.rollback.mockRejectedValue(new Error('Controller offline'));
    renderHistory();
    fireEvent.click(await (await revisionSection(1)).findByRole('button', { name: 'Preview rollback to revision 1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Publish rollback as new revision' }));
    await waitFor(() => expect(api.rollback).toHaveBeenCalled());
    await waitFor(() => expect(api.getDraft.mock.calls.length).toBeGreaterThan(1));
  });

  it('reports a failed preview without opening the review', async () => {
    api.preview.mockImplementation(async (_id: number, number: number) => {
      if (number === 1) throw new Error('Revision 1 is gone');
      return previewOf(number);
    });
    renderHistory();
    fireEvent.click(await (await revisionSection(1)).findByRole('button', { name: 'Preview rollback to revision 1' }));
    expect((await screen.findByText('Revision 1 is gone')).getAttribute('role')).toBe('alert');
    expect(screen.queryByText('Restore revision 1 as a new revision')).toBeNull();
  });
});
