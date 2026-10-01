// Coordinates unapplied edits, controller revisions and acknowledged manual output commands.
// FEATURE: WAGO front panel separates working settings from live configuration.
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FLOW_NODE_PREVIEW_QUERY_KEY } from '@attraccess/plugins-frontend-sdk';
import {
  getConfigurationBaseline,
  publishConfiguration,
  reviewConfiguration,
  saveDraft,
  validateConfiguration,
  manualCommand,
  type ConfigurationReview,
  type ConfigurationValidationError,
  type WagoConfigurationDraft,
} from '../api';
import { emptyConfiguration, emptyMetadata, readMetadata } from '../configuration-model';
import { useWagoDiagnostics } from '../diagnostics';
import { useDraftQuery } from '../queries';
import { outputBehavior } from '../../../channel-behavior';
import { type Channel, type PanelConfiguration } from './model';

interface WorkingCopy {
  configuration: PanelConfiguration;
  loadedDraft: WagoConfigurationDraft | null;
}

export function readConfiguration(
  source: { snapshot: string; presetProvenance?: string | null } | null | undefined,
): PanelConfiguration {
  return source
    ? { snapshot: JSON.parse(source.snapshot), metadata: readMetadata(source.presetProvenance ?? null) }
    : { snapshot: emptyConfiguration, metadata: emptyMetadata };
}

function draftIdentity(draft: WagoConfigurationDraft | null | undefined) {
  return JSON.stringify(draft ? [draft.snapshot, draft.presetProvenance, draft.updatedAt] : null);
}

export function useFrontPanel(controllerId: number) {
  const client = useQueryClient();
  const key = ['wago', 'front-panel-working-copy', controllerId];
  const [restored] = useState(() => client.getQueryData<WorkingCopy>(key));
  const draft = useDraftQuery(controllerId);
  const baseline = useQuery({
    queryKey: ['wago', 'configuration-baseline', controllerId],
    queryFn: () => getConfigurationBaseline(controllerId),
    refetchInterval: 2000,
  });
  const diagnostics = useWagoDiagnostics(controllerId, 2000);
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
        if (currentReview.impacts.length) {
          setReview(currentReview);
          return;
        }
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
  const published = diagnostics.data?.configuration;
  const pending =
    !published?.rejected &&
    ((waitingRevision !== null && (published?.appliedRevision ?? 0) < waitingRevision) ||
      (published?.publishedState === 'published' && published.publishedRevision !== published.appliedRevision));
  const enabled = Boolean(
    !pending &&
    applied &&
    diagnostics.isSuccess &&
    diagnostics.data?.capabilities.includes('front-panel-v1') &&
    diagnostics.data.connectivity === 'online' &&
    !diagnostics.data.incompatible &&
    !diagnostics.data.configuration.revisionMismatch &&
    diagnostics.data.configuration.appliedRevision === baseline.data?.revision,
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
