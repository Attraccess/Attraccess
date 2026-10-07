import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FLOW_NODE_PREVIEW_QUERY_KEY } from '@attraccess/plugins-frontend-sdk';
import {
  getConfigurationBaseline,
  type ConfigurationReview,
  type ConfigurationValidationError,
  type WagoConfigurationDraft,
} from '../api';
import { emptyConfiguration, emptyMetadata } from '../configuration-model';
import { useWagoDiagnostics } from '../diagnostics';
import { useDraftQuery } from '../queries';
import { useWagoLiveQuery } from '../live-updates';
import { type PanelConfiguration } from './model';
import { WorkingCopy } from './useFrontPanel.working-copy';
import { readConfiguration } from './useFrontPanel.helpers';
import { draftIdentity } from './useFrontPanel.helpers';

export function useFrontPanelInputs(controllerId: number) {
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
  return {
    client,
    key,
    restored,
    draft,
    baseline,
    diagnostics,
    configuration,
    setConfiguration,
    loadedDraft,
    editing,
    setEditing,
    errorKey,
    setErrorKey,
    backendError,
    setBackendError,
    validationErrors,
    setValidationErrors,
    review,
    setReview,
    waitingRevision,
    setWaitingRevision,
    initialized,
    loadedBaseline,
    applied,
    dirty,
    conflict,
    refresh,
    controllerId,
  } as const;
}
