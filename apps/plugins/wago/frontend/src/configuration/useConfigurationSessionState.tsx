import { useConfigurationWorkingCopyState } from './useConfigurationWorkingCopyState';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from '../api/client';
import {
  useConfigurationActions,
  useConfigurationBaselineQuery,
  useDraftQuery,
  useSaveDraftMutation,
} from '../api/queries';
import { emptyConfiguration, metadataForSnapshot, readMetadata } from './model';
import { validateModbus, validateModbusBindings } from '../../../modbus/model';
import { useWagoDiagnostics } from '../diagnostics/diagnostics';
import { useWagoTranslations } from '../i18n';

import { WorkingCopy } from './ConfigurationEditor';
import { draftIdentity } from './ConfigurationEditor';

export function useConfigurationSessionState({ controllerId, onClose }: { controllerId: number; onClose: () => void }) {
  const { t } = useWagoTranslations();
  const client = useQueryClient();
  const localKey = ['wago', 'configuration-working-copy', controllerId] as const;
  const [restored] = useState(() => client.getQueryData<WorkingCopy>(localKey));
  const draft = useDraftQuery(controllerId);
  const baseline = useConfigurationBaselineQuery(controllerId, draft.isSuccess && draft.data === null);
  const diagnostics = useWagoDiagnostics(controllerId);
  const working = useConfigurationWorkingCopyState(restored);
  const {
    snapshot,
    setSnapshot,
    metadata,
    setMetadata,
    initialized,
    setInitialized,
    dirty,
    setDirty,
    draftConflict,
    setDraftConflict,
    setError,
    setNotice,
    setDiscard,
    setGeneration,
    revisionBusy,
    presetBusy,
  } = working;
  const save = useSaveDraftMutation(controllerId);
  const { validate } = useConfigurationActions(controllerId);
  const editVersion = useRef(0);
  const loadedDraft = useRef<string | null>(restored?.source ?? null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (draft.isPending || draft.isError || (draft.data === null && !baseline.isSuccess)) return;
    const incoming = draftIdentity(draft.data);
    if (incoming === loadedDraft.current) return;
    if (initialized && dirty) {
      setDraftConflict(true);
      return;
    }
    try {
      const source = draft.data ?? baseline.data;
      const value = source ? JSON.parse(source.snapshot) : emptyConfiguration;
      if (value.version !== 1 || !Array.isArray(value.physicalPoints) || !Array.isArray(value.logicalChannels))
        throw new Error(t('editor.unsupported'));
      setSnapshot(value);
      setMetadata(readMetadata((draft.data ?? baseline.data)?.presetProvenance ?? null));
      setInitialized(true);
      setDirty(false);
      setDraftConflict(false);
      loadedDraft.current = incoming;
      setGeneration((value) => value + 1);
    } catch (error) {
      setInitialized(false);
      setError(error instanceof Error ? error.message : { key: 'editor.readError' });
    }
  }, [draft.data, draft.isPending, draft.isError, dirty, initialized, baseline.data, baseline.isSuccess, t]);
  useEffect(() => {
    client.setQueryDefaults(['wago', 'configuration-working-copy'], { gcTime: Infinity });
  }, [client]);
  useEffect(() => {
    if (dirty) client.setQueryData(localKey, { snapshot, metadata, source: loadedDraft.current });
    else client.removeQueries({ queryKey: localKey, exact: true });
  }, [snapshot, metadata, dirty, client, controllerId]);
  useEffect(() => {
    if (!dirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [dirty]);
  function changed() {
    editVersion.current++;
    setDirty(true);
    setError(null);
    setNotice('');
    setGeneration((value) => value + 1);
    validate.reset();
  }
  function edit(value: WagoConfigurationSnapshot) {
    changed();
    setSnapshot(value);
  }
  function editMetadata(value: ConfigurationEditorMetadata) {
    changed();
    setMetadata(value);
  }
  const modbusErrors = [
    ...(snapshot.modbus ? validateModbus(snapshot.modbus) : []),
    ...validateModbusBindings(snapshot),
  ];
  async function saveDraft() {
    if (busy || draftConflict || modbusErrors.length) return;
    const savingVersion = editVersion.current;
    setError(null);
    setNotice('');
    try {
      const result = await validate.mutateAsync(snapshot);
      if (!mounted.current || savingVersion !== editVersion.current || !result.valid) return;
      const savedMetadata = metadataForSnapshot(snapshot, metadata);
      const saved = await save.mutateAsync({
        snapshot,
        metadata: savedMetadata,
        expectedDraft: draft.data
          ? {
              snapshot: draft.data.snapshot,
              presetProvenance: draft.data.presetProvenance,
              updatedAt: draft.data.updatedAt,
            }
          : null,
      });
      loadedDraft.current = draftIdentity(saved);
      if (!mounted.current || savingVersion !== editVersion.current) return;
      setDirty(false);
      setDraftConflict(false);
      setMetadata(savedMetadata);
      setNotice({ key: 'editor.saved' });
      setGeneration((value) => value + 1);
    } catch (error) {
      if (mounted.current) {
        setError(error instanceof Error ? error.message : { key: 'editor.saveError' });
        void draft.refetch();
      }
    }
  }
  const busy = save.isPending || validate.isPending || revisionBusy || presetBusy;
  function reloadSavedDraft() {
    loadedDraft.current = null;
    setDirty(false);
    setDraftConflict(false);
    void draft.refetch();
  }
  function close() {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  }
  const editingDisabled = busy || draftConflict || !initialized;
  const reviewDisabled =
    dirty ||
    draftConflict ||
    modbusErrors.length > 0 ||
    save.isPending ||
    validate.isPending ||
    presetBusy ||
    !initialized;
  return {
    ...working,
    t,
    client,
    localKey,
    draft,
    baseline,
    diagnostics,
    save,
    validate,
    loadedDraft,
    edit,
    editMetadata,
    modbusErrors,
    saveDraft,
    busy,
    reloadSavedDraft,
    close,
    editingDisabled,
    reviewDisabled,
    controllerId,
    onClose,
  } as const;
}
