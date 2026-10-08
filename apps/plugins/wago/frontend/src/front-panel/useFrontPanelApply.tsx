import { useMutation } from '@tanstack/react-query';
import {
  publishConfiguration,
  reviewConfiguration,
  saveDraft,
  validateConfiguration,
  manualCommand,
} from '../api/client';
import { outputBehavior } from '../../../channel-behavior';
import { type Channel } from './model';
import { readConfiguration } from './useFrontPanel';
import type { useFrontPanelInputs } from './useFrontPanelInputs';

export function useFrontPanelApply(model: ReturnType<typeof useFrontPanelInputs>) {
  const apply = useMutation({
    mutationFn: async (confirmed: boolean) => {
      if (!model.configuration) return;
      model.setErrorKey(null);
      model.setBackendError(null);
      model.setValidationErrors([]);
      let currentReview = confirmed ? model.review : null;
      if (!currentReview) {
        const validation = await validateConfiguration(model.controllerId, model.configuration.snapshot);
        if (!validation.valid) {
          model.setValidationErrors(validation.errors);
          model.setErrorKey('panel.applyError');
          return;
        }
        const saved = await saveDraft(
          model.controllerId,
          model.configuration.snapshot,
          model.configuration.metadata,
          model.loadedDraft.current,
        );
        model.loadedDraft.current = saved;
        model.client.setQueryData(['wago', 'configuration-draft', model.controllerId], saved);
        currentReview = await reviewConfiguration(model.controllerId);
        model.loadedDraft.current = currentReview.draft;
        model.client.setQueryData(['wago', 'configuration-draft', model.controllerId], currentReview.draft);
        await model.diagnostics.refetch();
        model.setReview(currentReview);
        return;
      }
      const reviewedHash = currentReview.draft.reviewedHash;
      if (!reviewedHash) throw new Error('Review the current configuration draft before publishing it');
      const result = await publishConfiguration(model.controllerId, confirmed, reviewedHash);
      model.setConfiguration(readConfiguration(currentReview.draft));
      model.setWaitingRevision(result.revision);
      model.setReview(null);
      model.setEditing(false);
      await model.refresh();
    },
    onError: (error) => {
      model.setBackendError(error instanceof Error ? error.message : String(error));
      void model.draft.refetch();
    },
  });
  const manual = useMutation({
    mutationFn: async ({ channel, value, release }: { channel: Channel; value?: boolean; release?: boolean }) => {
      const revision = model.baseline.data?.revision;
      if (!revision) throw new Error('No applied configuration');
      const result = await manualCommand(model.controllerId, {
        channelId: channel.id,
        action: release ? 'release' : outputBehavior(channel) === 'pulsed' ? 'pulse' : 'set',
        ...(value !== undefined ? { value } : {}),
        expectedConfigurationRevision: revision,
        acknowledgementTimeoutSeconds: 10,
      });
      if (result.result !== 'acknowledged') model.setErrorKey(`panel.commandResults.${result.result}`);
      await model.diagnostics.refetch();
    },
    onError: () => model.setErrorKey('panel.commandResults.transport_failure'),
  });
  const release = useMutation({
    mutationFn: async () => {
      for (const id of model.diagnostics.data?.manualOutputChannelIds ?? []) {
        const channel = model.applied?.snapshot.logicalChannels.find((item) => item.id === id);
        if (channel) await manual.mutateAsync({ channel, release: true });
      }
    },
  });
  const discard = useMutation({
    mutationFn: async () => {
      const latest = await model.baseline.refetch();
      if (!latest.isSuccess) throw new Error('Could not load controller configuration');
      const configuration = readConfiguration(latest.data);
      const saved = await saveDraft(
        model.controllerId,
        configuration.snapshot,
        configuration.metadata,
        model.draft.data ?? null,
      );
      model.loadedDraft.current = saved;
      model.client.setQueryData(['wago', 'configuration-draft', model.controllerId], saved);
      model.setConfiguration(configuration);
      model.setEditing(false);
      model.setReview(null);
      model.setErrorKey(null);
      model.setBackendError(null);
      model.setValidationErrors([]);
    },
    onError: () => model.setErrorKey('panel.discardError'),
  });
  const busy = apply.isPending || manual.isPending || release.isPending || discard.isPending;
  const published = model.diagnostics.data?.configuration;
  const pending =
    !published?.rejected &&
    ((model.waitingRevision !== null && (published?.appliedRevision ?? 0) < model.waitingRevision) ||
      (published?.publishedState === 'published' && published.publishedRevision !== published.appliedRevision));
  const enabled = Boolean(
    !pending &&
    model.applied &&
    model.diagnostics.isSuccess &&
    model.diagnostics.data?.capabilities.includes('front-panel-v1') &&
    model.diagnostics.data.connectivity === 'online' &&
    !model.diagnostics.data.incompatible &&
    !model.diagnostics.data.configuration.revisionMismatch &&
    model.diagnostics.data.configuration.appliedRevision === model.baseline.data?.revision,
  );
  return { ...model, apply, manual, release, discard, busy, published, pending, enabled } as const;
}
