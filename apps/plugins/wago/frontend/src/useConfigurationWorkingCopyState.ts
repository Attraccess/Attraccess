import { useState } from 'react';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from './api';
import { emptyConfiguration, emptyMetadata } from './configuration-model';
import type { TranslationMessage } from '@attraccess/plugins-frontend-ui';
import type { WorkingCopy, Section } from './ConfigurationEditor.contracts';
export function useConfigurationWorkingCopyState(restored: WorkingCopy | undefined) {
  const [section, setSection] = useState<Section>('channels');
  const [focusChannelId, setFocusChannelId] = useState<string>();
  const [snapshot, setSnapshot] = useState<WagoConfigurationSnapshot>(restored?.snapshot ?? emptyConfiguration);
  const [metadata, setMetadata] = useState<ConfigurationEditorMetadata>(restored?.metadata ?? emptyMetadata);
  const [initialized, setInitialized] = useState(!!restored);
  const [dirty, setDirty] = useState(!!restored);
  const [draftConflict, setDraftConflict] = useState(false);
  const [error, setError] = useState<string | TranslationMessage | null>(null);
  const [notice, setNotice] = useState<string | TranslationMessage>('');
  const [discard, setDiscard] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [presetBusy, setPresetBusy] = useState(false);
  return {
    section,
    setSection,
    focusChannelId,
    setFocusChannelId,
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
    error,
    setError,
    notice,
    setNotice,
    discard,
    setDiscard,
    generation,
    setGeneration,
    revisionBusy,
    setRevisionBusy,
    presetBusy,
    setPresetBusy,
  };
}
