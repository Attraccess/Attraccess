import { expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import type { VisualConfigurationWorkflowTestScope } from './visual-editor.test';
export function registerReconcilesRollbackAfterSAndSendsThePreviewedDraftIdentity(
  scope: VisualConfigurationWorkflowTestScope,
): void {
  it.each(['success', 'delivery failure', 'refresh failure', 'unsupported refresh'] as const)(
    'reconciles rollback after %s and sends the previewed draft identity',
    async (outcome) => {
      const revision = {
        revision: 1,
        contentHash: 'historical',
        state: 'applied',
        publishedAt: '2026-09-05',
        reportedAt: '2026-09-05',
        rejectionErrors: null,
        snapshot: JSON.stringify(scope.state.snapshot),
      };
      scope.state.history.mockResolvedValue({ revisions: [revision], offset: 0, limit: 20 });
      scope.state.revisionPreview.mockResolvedValue({
        revision,
        current: revision,
        draftHash: 'snapshot-and-metadata',
        diff: [],
        impacts: [],
      });
      scope.state.rollback.mockImplementation(async () => {
        if (outcome === 'refresh failure') scope.state.getDraft.mockRejectedValue(new Error('refresh unavailable'));
        else if (outcome === 'unsupported refresh')
          scope.state.getDraft.mockResolvedValue({
            controllerId: 1,
            snapshot: '{"version":2}',
            updatedAt: '2026-09-05',
          });
        else
          scope.state.getDraft.mockResolvedValue({
            controllerId: 1,
            snapshot: JSON.stringify({
              ...scope.state.snapshot,
              logicalChannels: [
                {
                  ...scope.state.snapshot.logicalChannels[0],
                  pulse: { durationMs: 250 },
                  capabilities: ['output', 'pulse'],
                },
              ],
            }),
            presetProvenance: JSON.stringify({
              editor: { names: { output: 'Persisted rollback', point: 'DO1' }, presets: [] },
            }),
            reviewedHash: 'historical',
            updatedAt: '2026-09-05',
          });
        scope.state.history.mockResolvedValue({
          revisions: [{ ...revision, revision: 2, state: outcome === 'success' ? 'published' : 'pending' }, revision],
          offset: 0,
          limit: 20,
        });
        if (outcome !== 'success') throw new Error('delivery failed');
        return { ...revision, revision: 2 };
      });
      scope.mount();
      const user = userEvent.setup();
      await screen.findByRole('textbox', { name: 'Channel name' });
      await scope.section(user, 'History');
      await user.click(await screen.findByRole('button', { name: 'Preview rollback to revision 1' }));
      await user.click(await screen.findByRole('button', { name: 'Publish rollback as new revision' }));
      await waitFor(() =>
        expect(scope.state.rollback).toHaveBeenCalledWith(
          1,
          1,
          false,
          'historical',
          'historical',
          'snapshot-and-metadata',
        ),
      );
      if (outcome === 'refresh failure' || outcome === 'unsupported refresh') {
        expect(
          await screen.findByText(
            outcome === 'unsupported refresh'
              ? /unsupported configuration structure/
              : /Could not reconcile the saved draft after rollback/,
          ),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
        expect(screen.queryByRole('textbox', { name: 'Channel name' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'WAGO controllers' })).toBeEnabled();
        if (outcome === 'unsupported refresh') {
          act(() => useTranslationState.setState({ language: 'de' }));
          expect(screen.getByText(/nicht unterstützt/)).toBeInTheDocument();
          expect(screen.queryByText(/unsupported/)).not.toBeInTheDocument();
        }
      } else {
        await scope.section(user, 'Channels');
        await waitFor(() =>
          expect(screen.getByRole('textbox', { name: 'Channel name' })).toHaveValue('Persisted rollback'),
        );
        expect(screen.getByRole('spinbutton', { name: 'Pulse duration (ms)' })).toHaveValue(250);
        expect(screen.queryByRole('button', { name: 'Publish rollback as new revision' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Publish reviewed draft' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
        if (outcome === 'delivery failure') {
          expect(screen.getByText('delivery failed')).toBeInTheDocument();
          expect(screen.getByText(/Pending delivery/)).toBeInTheDocument();
        }
      }
      expect(scope.state.save).not.toHaveBeenCalled();
    },
  );
}
