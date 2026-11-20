import { FLOW_NODE_PREVIEW_QUERY_KEY } from '@attraccess/plugins-frontend-sdk';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { WagoDiagnostics } from '../../../../diagnostics-types';
import { outputBehavior } from '../../../../channel-behavior';
import {
  getConfigurationBaseline,
  manualCommand,
  publishConfiguration,
  reviewConfiguration,
  saveDraft,
  validateConfiguration,
  type ConfigurationReview,
  type ConfigurationValidationError,
  type WagoConfigurationDraft,
} from '../../api/client';
import { useWagoLiveQuery } from '../../api/live-updates';
import { useDraftQuery } from '../../api/queries';
import { emptyConfiguration, emptyMetadata } from '../../configuration/model';
import { useWagoDiagnostics } from '../../diagnostics/diagnostics';
import type { LiveControls } from '../controls/Cards';
import type { Channel, PanelConfiguration } from '../model';
import { draftIdentity, readConfiguration, type WorkingCopy } from './workingCopy';

export interface FrontPanelWorkingCopy {
  configuration: PanelConfiguration | null;
  applied: PanelConfiguration | null;
  diagnostics: UseQueryResult<WagoDiagnostics>;
  dirty: boolean;
  conflict: boolean;
  busy: boolean;
  pending: boolean;
  review: ConfigurationReview | null;
  errorKey: string | null;
  backendError: string | null;
  validationErrors: ConfigurationValidationError[];
  ready: boolean;
  loadError: boolean;
  live: LiveControls;
  edit: (next: PanelConfiguration) => void;
  discard: () => void;
  apply: () => void;
  confirmApply: () => void;
  cancelReview: () => void;
  release: () => void;
}

/** An apply this session started, or a published revision, has not reached the controller yet. */
function isApplyPending(diagnostics: WagoDiagnostics | undefined, waitingRevision: number | null): boolean {
  const published = diagnostics?.configuration;
  if (published?.rejected) return false;
  return (
    (waitingRevision !== null && (published?.appliedRevision ?? 0) < waitingRevision) ||
    (published?.publishedState === 'published' && published.publishedRevision !== published.appliedRevision)
  );
}

/** The controller is online, supports the front panel and runs exactly the applied baseline revision. */
function canUseLiveControls(diagnostics: WagoDiagnostics | undefined, baselineRevision: number | undefined): boolean {
  return Boolean(
    diagnostics?.capabilities.includes('front-panel-v1') &&
    diagnostics.connectivity === 'online' &&
    !diagnostics.incompatible &&
    !diagnostics.configuration.revisionMismatch &&
    diagnostics.configuration.appliedRevision === baselineRevision,
  );
}

/**
 * Working copy of the controller configuration plus live controls, shared by the front panel page, its
 * alerts, the device cards and the apply confirmation so they all edit and apply the same copy.
 */
export function useFrontPanel(controllerId: number): FrontPanelWorkingCopy {
  const client = useQueryClient();
  const key = ['wago', 'front-panel-working-copy', controllerId];
  const [restored] = useState(() => client.getQueryData<WorkingCopy>(key));
  const draft = useDraftQuery(controllerId);
  useWagoLiveQuery(['wago', 'configuration-baseline', controllerId], 'configuration-baseline', String(controllerId));
  const baseline = useQuery({
    queryKey: ['wago', 'configuration-baseline', controllerId],
    queryFn: () => getConfigurationBaseline(controllerId),
  });
  const diagnostics = useWagoDiagnostics(controllerId);
  const [configuration, setConfiguration] = useState<PanelConfiguration | null>(restored?.configuration ?? null);
  const loadedDraft = useRef<WagoConfigurationDraft | null>(restored?.loadedDraft ?? null);
  const [editing, setEditing] = useState(Boolean(restored));
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ConfigurationValidationError[]>([]);
  const [review, setReview] = useState<ConfigurationReview | null>(null);
  const [waitingRevision, setWaitingRevision] = useState<number | null>(null);
  const initialized = useRef(Boolean(restored));
  const loadedBaseline = useRef<number | null>(baseline.data?.revision ?? null);
  useEffect(() => {
    if (initialized.current || !draft.isSuccess || !baseline.isSuccess) return;
    try {
      const next = readConfiguration(draft.data ?? baseline.data);
      if (
        next.snapshot.version !== 1 ||
        !Array.isArray(next.snapshot.physicalPoints) ||
        !Array.isArray(next.snapshot.logicalChannels)
      )
        throw new Error('unsupported configuration');
      loadedDraft.current = draft.data ?? null;
      loadedBaseline.current = baseline.data?.revision ?? null;
      initialized.current = true;
      setConfiguration(next);
      // A persisted draft is still a working copy: external baseline updates
      // must not replace it merely because this session has not typed yet.
      setEditing(JSON.stringify(next) !== JSON.stringify(readConfiguration(baseline.data)));
    } catch {
      setErrorKey('panel.readError');
    }
  }, [draft.isSuccess, draft.data, baseline.isSuccess, baseline.data]);
  useEffect(() => {
    client.setQueryDefaults(['wago', 'front-panel-working-copy'], { gcTime: Infinity });
    if (editing && configuration) client.setQueryData(key, { configuration, loadedDraft: loadedDraft.current });
    else client.removeQueries({ queryKey: key, exact: true });
  }, [client, controllerId, configuration, editing, draft.data]);
  const applied = baseline.data ? readConfiguration(baseline.data) : null;
  useEffect(() => {
    const revision = baseline.data?.revision ?? null;
    if (!initialized.current || loadedBaseline.current === revision) return;
    loadedBaseline.current = revision;
    // Follow successful application/rollback without replacing local edits.
    if (!editing) setConfiguration(readConfiguration(baseline.data));
  }, [baseline.data, editing]);
  const dirty = Boolean(
    configuration &&
    JSON.stringify(configuration) !==
      JSON.stringify(applied ?? { snapshot: emptyConfiguration, metadata: emptyMetadata }),
  );
  const conflict =
    initialized.current && draft.isSuccess && draftIdentity(loadedDraft.current) !== draftIdentity(draft.data);
  useEffect(() => {
    if (!dirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [dirty]);
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['wago', 'configuration-revisions', controllerId] }),
      client.invalidateQueries({ queryKey: ['wago', 'configuration-baseline', controllerId] }),
      client.invalidateQueries({ queryKey: ['wago', 'configuration-draft', controllerId] }),
      client.invalidateQueries({ queryKey: ['wago', 'diagnostics', controllerId] }),
      client.invalidateQueries({ queryKey: FLOW_NODE_PREVIEW_QUERY_KEY }),
    ]);
  };
  const apply = useMutation({
    mutationFn: async (confirmed: boolean) => {
      if (!configuration) return;
      setErrorKey(null);
      setBackendError(null);
      setValidationErrors([]);
      let currentReview = confirmed ? review : null;
      if (!currentReview) {
        const validation = await validateConfiguration(controllerId, configuration.snapshot);
        if (!validation.valid) {
          setValidationErrors(validation.errors);
          setErrorKey('panel.applyError');
          return;
        }
        const saved = await saveDraft(
          controllerId,
          configuration.snapshot,
          configuration.metadata,
          loadedDraft.current,
        );
        loadedDraft.current = saved;
        client.setQueryData(['wago', 'configuration-draft', controllerId], saved);
        currentReview = await reviewConfiguration(controllerId);
        loadedDraft.current = currentReview.draft;
        client.setQueryData(['wago', 'configuration-draft', controllerId], currentReview.draft);
        await diagnostics.refetch();
        setReview(currentReview);
        return;
      }
      const reviewedHash = currentReview.draft.reviewedHash;
      if (!reviewedHash) throw new Error('Review the current configuration draft before publishing it');
      const result = await publishConfiguration(controllerId, confirmed, reviewedHash);
      setConfiguration(readConfiguration(currentReview.draft));
      setWaitingRevision(result.revision);
      setReview(null);
      setEditing(false);
      await refresh();
    },
    onError: (error) => {
      setBackendError(error instanceof Error ? error.message : String(error));
      void draft.refetch();
    },
  });
  const manual = useMutation({
    mutationFn: async ({ channel, value, release }: { channel: Channel; value?: boolean; release?: boolean }) => {
      const revision = baseline.data?.revision;
      if (!revision) throw new Error('No applied configuration');
      const result = await manualCommand(controllerId, {
        channelId: channel.id,
        action: release ? 'release' : outputBehavior(channel) === 'pulsed' ? 'pulse' : 'set',
        ...(value !== undefined ? { value } : {}),
        expectedConfigurationRevision: revision,
        acknowledgementTimeoutSeconds: 10,
      });
      if (result.result !== 'acknowledged') setErrorKey(`panel.commandResults.${result.result}`);
      await diagnostics.refetch();
    },
    onError: () => setErrorKey('panel.commandResults.transport_failure'),
  });
  const release = useMutation({
    mutationFn: async () => {
      for (const id of diagnostics.data?.manualOutputChannelIds ?? []) {
        const channel = applied?.snapshot.logicalChannels.find((item) => item.id === id);
        if (channel) await manual.mutateAsync({ channel, release: true });
      }
    },
  });
  const discard = useMutation({
    mutationFn: async () => {
      const latest = await baseline.refetch();
      if (!latest.isSuccess) throw new Error('Could not load controller configuration');
      const configuration = readConfiguration(latest.data);
      const saved = await saveDraft(controllerId, configuration.snapshot, configuration.metadata, draft.data ?? null);
      loadedDraft.current = saved;
      client.setQueryData(['wago', 'configuration-draft', controllerId], saved);
      setConfiguration(configuration);
      setEditing(false);
      setReview(null);
      setErrorKey(null);
      setBackendError(null);
      setValidationErrors([]);
    },
    onError: () => setErrorKey('panel.discardError'),
  });
  const busy = apply.isPending || manual.isPending || release.isPending || discard.isPending;
  const pending = isApplyPending(diagnostics.data, waitingRevision);
  const enabled = Boolean(
    !pending && applied && diagnostics.isSuccess && canUseLiveControls(diagnostics.data, baseline.data?.revision),
  );
  return {
    configuration,
    applied,
    diagnostics,
    dirty,
    conflict,
    busy,
    pending,
    review,
    errorKey,
    backendError,
    validationErrors,
    ready: Boolean(configuration && draft.isSuccess && baseline.isSuccess),
    loadError: draft.isError || baseline.isError,
    live: {
      applied,
      diagnostics: diagnostics.data,
      enabled,
      busy,
      command: (channel: Channel, value?: boolean) => {
        if (!enabled || busy) return;
        setErrorKey(null);
        manual.mutate({ channel, value });
      },
    },
    edit: (next: PanelConfiguration) => {
      setConfiguration(next);
      setEditing(true);
      setReview(null);
      setErrorKey(null);
      setBackendError(null);
      setValidationErrors([]);
    },
    discard: () => discard.mutate(),
    apply: () => apply.mutate(false),
    confirmApply: () => apply.mutate(true),
    cancelReview: () => setReview(null),
    release: () => release.mutate(),
  };
}
