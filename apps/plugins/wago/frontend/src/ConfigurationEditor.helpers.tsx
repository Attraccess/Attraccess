import { Button } from '@heroui/react';
import { ArrowRight } from 'lucide-react';
import type { WagoConfigurationSnapshot } from './api';
import { useConfigurationBaselineQuery } from './queries';
import { useDraftQuery } from './queries';
import { useWagoTranslations } from './i18n';
import { Alert } from '@heroui/react';
import type { ConfigurationEditorMetadata } from './api';
import { useConfigurationActions } from './queries';
import { ConfigurationErrors } from './ConfigurationChanges';
import type { TranslationMessage } from '@attraccess/plugins-frontend-ui';
import type { WagoConfigurationDraft } from './api';

export function ConfigurationToolbar({
  snapshot,
  dirty,
  draft,
  baseline,
  editingDisabled,
  hasErrors,
  saving,
  busy,
  initialized,
  onSave,
  onReview,
}: {
  snapshot: WagoConfigurationSnapshot;
  dirty: boolean;
  draft: ReturnType<typeof useDraftQuery>['data'];
  baseline: ReturnType<typeof useConfigurationBaselineQuery>['data'];
  editingDisabled: boolean;
  hasErrors: boolean;
  saving: boolean;
  busy: boolean;
  initialized: boolean;
  onSave: () => void;
  onReview: () => void;
}) {
  const { t } = useWagoTranslations();
  return (
    <div className="wg:sticky wg:top-0 wg:z-10 wg:flex wg:flex-wrap wg:items-center wg:justify-between wg:gap-3 wg:rounded-xl wg:border wg:border-border wg:bg-surface wg:p-4">
      <div>
        <p role="status" className="wg:font-medium">
          {dirty
            ? t('editor.unsaved')
            : draft
              ? t('editor.draftSaved')
              : baseline
                ? t('editor.startingFrom', { revision: baseline.revision })
                : t('editor.noDraft')}
        </p>
        <p className="wg:text-sm wg:text-muted">
          {t('editor.counts', {
            channels: snapshot.logicalChannels.length,
            devices: snapshot.modbus?.devices.length ?? 0,
          })}
        </p>
      </div>
      <div className="wg:flex wg:flex-wrap wg:gap-2">
        <Button variant="secondary" isDisabled={editingDisabled || hasErrors} isPending={saving} onPress={onSave}>
          {t('editor.save')}
        </Button>
        <Button isDisabled={busy || !initialized} onPress={onReview}>
          {t('editor.reviewChanges')} <ArrowRight className="wg:size-4" />
        </Button>
      </div>
    </div>
  );
}

export function DraftFeedback({
  draft,
  baseline,
  draftConflict,
  reloadSavedDraft,
  error,
  notice,
  validate,
  snapshot,
  metadata,
}: {
  draft: ReturnType<typeof useDraftQuery>;
  baseline: ReturnType<typeof useConfigurationBaselineQuery>;
  draftConflict: boolean;
  reloadSavedDraft: () => void;
  error: string | TranslationMessage | null;
  notice: string | TranslationMessage;
  validate: ReturnType<typeof useConfigurationActions>['validate'];
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
}) {
  const { t, tMessage } = useWagoTranslations();
  return (
    <>
      {draft.isPending && <p role="status">{t('editor.loadingDraft')}</p>}
      {draft.isError && (
        <p role="alert">
          {t('editor.loadError', { error: draft.error.message })}{' '}
          <Button variant="secondary" onPress={() => void draft.refetch()}>
            {t('editor.retryDraft')}
          </Button>
        </p>
      )}
      {draft.data === null && baseline.isPending && <p role="status">{t('editor.loadingApplied')}</p>}
      {draft.data === null && baseline.isError && (
        <p role="alert">
          {t('editor.appliedError', { error: baseline.error.message })}{' '}
          <Button variant="secondary" onPress={() => void baseline.refetch()}>
            {t('editor.retryConfiguration')}
          </Button>
        </p>
      )}
      {draftConflict && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t('editor.draftChanged')}</Alert.Title>
            <Alert.Description>{t('editor.conflict')}</Alert.Description>
            <Button variant="secondary" onPress={reloadSavedDraft}>
              {t('editor.reload')}
            </Button>
          </Alert.Content>
        </Alert>
      )}
      {(error || validate.error) && <p role="alert">{error ? tMessage(error) : validate.error?.message}</p>}
      {notice && <p role="status">{tMessage(notice)}</p>}
      {validate.data && !validate.data.valid && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>{t('editor.resolveFields')}</Alert.Title>
            <ConfigurationErrors errors={validate.data.errors} snapshot={snapshot} names={metadata.names} />
          </Alert.Content>
        </Alert>
      )}
    </>
  );
}

export function draftIdentity(draft: WagoConfigurationDraft | null | undefined) {
  return draft ? JSON.stringify([draft.updatedAt, draft.snapshot, draft.presetProvenance]) : 'empty';
}
