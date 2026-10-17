import { useEffect, useState } from 'react';
import type { ConfigurationEditorMetadata } from '../api/client';
import { useConfigurationActions, useConfigurationRevisionsQuery } from '../api/queries';
import { readMetadata } from './model';
import { useWagoTranslations } from '../i18n';
import type { TranslationMessage } from '@attraccess/plugins-frontend-ui';

export function useConfigurationRevisionsState({
  controllerId,
  metadata,
  disabled,
  onRollback,
  generation,
  onBusyChange,
  view = 'review',
  hasSavedDraft = true,
}: {
  view?: 'review' | 'history';
  hasSavedDraft?: boolean;
  controllerId: number;
  metadata: ConfigurationEditorMetadata;
  disabled: boolean;
  onRollback: (failure?: unknown) => Promise<void>;
  generation: number;
  onBusyChange: (busy: boolean) => void;
}) {
  const { t, language, tMessage } = useWagoTranslations();
  const [offset, setOffset] = useState(0);
  const history = useConfigurationRevisionsQuery(controllerId, offset);
  const actions = useConfigurationActions(controllerId);
  const [force, setForce] = useState(false);
  const [rollbackForce, setRollbackForce] = useState(false);
  const [error, setError] = useState<string | TranslationMessage | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const busy =
    reconciling ||
    actions.review.isPending ||
    actions.publish.isPending ||
    actions.preview.isPending ||
    actions.acknowledgeRejection.isPending ||
    actions.rollback.isPending;
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(() => {
    actions.review.reset();
    actions.preview.reset();
    setForce(false);
    setRollbackForce(false);
    setError(null);
  }, [generation]);
  const review = actions.review.data;
  const preview = actions.preview.data;
  const reviewNames = {
    ...readMetadata(review?.previous?.presetProvenance ?? null).names,
    ...readMetadata(review?.draft.presetProvenance ?? null).names,
  };
  const rollbackNames = { ...metadata.names, ...readMetadata(preview?.revision.presetProvenance ?? null).names };
  async function run(operation: () => Promise<unknown>) {
    setError(null);
    try {
      await operation();
    } catch (error) {
      setError(error instanceof Error ? error.message : { key: 'revisions.error' });
    }
  }
  return {
    t,
    language,
    tMessage,
    offset,
    setOffset,
    history,
    actions,
    force,
    setForce,
    rollbackForce,
    setRollbackForce,
    error,
    setReconciling,
    busy,
    review,
    preview,
    reviewNames,
    rollbackNames,
    run,
    controllerId,
    metadata,
    disabled,
    onRollback,
    view,
    hasSavedDraft,
  } as const;
}
