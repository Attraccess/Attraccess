import type { TranslationMessage } from '@attraccess/plugins-frontend-ui';
import { Alert, Button, Card, Chip, Modal } from '@heroui/react';
import { Activity, ArrowLeft, ArrowRight, GitCompareArrows, History, Network, Settings2 } from 'lucide-react';
import { ConfigurationErrors } from './ConfigurationChanges';
import { ConfigurationSessionContent } from './ConfigurationSessionContent';
import { ConfigurationSessionForm } from './ConfigurationSessionForm';
import { ControllerDiagnostics } from '../diagnostics/ControllerDiagnostics';
import type { ConfigurationEditorMetadata, WagoConfigurationDraft, WagoConfigurationSnapshot } from '../api/client';
import { useWagoTranslations } from '../i18n';
import { useConfigurationActions, useConfigurationBaselineQuery, useDraftQuery } from '../api/queries';
import { useConfigurationSessionState } from './useConfigurationSessionState';

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

export function LocalDraftReview({
  dirty,
  hasDraft,
  disabled,
  validate,
  snapshot,
  metadata,
  setError,
}: {
  dirty: boolean;
  hasDraft: boolean;
  disabled: boolean;
  validate: ReturnType<typeof useConfigurationActions>['validate'];
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
  setError: (error: string | null) => void;
}) {
  const { t } = useWagoTranslations();
  return (
    <Card>
      <Card.Header>
        <Card.Title>{t('editor.checkSavePublish')}</Card.Title>
        <Card.Description>{t('editor.publishDescription')}</Card.Description>
      </Card.Header>
      <Card.Content className="wg:flex wg:flex-col wg:gap-3">
        {dirty && <p>{t('editor.saveBeforeReview')}</p>}
        {!hasDraft && !dirty && <p>{t('editor.saveToReview')}</p>}
        <Button
          variant="secondary"
          isDisabled={disabled}
          onPress={() => {
            setError(null);
            void validate.mutateAsync(snapshot).catch((error) => setError(error.message));
          }}
        >
          {t('editor.validate')}
        </Button>
        {validate.data?.valid && (
          <div role="status">
            {validate.data.valid ? t('editor.valid') : t('editor.resolveFields')}
            <ConfigurationErrors errors={validate.data.errors} snapshot={snapshot} names={metadata.names} />
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

/** Full-page workspace; the host route owns navigation and authorization. */
export function ConfigurationEditor({
  controllerId,
  onOpenChange,
}: {
  controllerId: number | null;
  onOpenChange: (open: boolean) => void;
}) {
  if (controllerId === null) return null;
  return <ConfigurationSession key={controllerId} controllerId={controllerId} onClose={() => onOpenChange(false)} />;
}

function ConfigurationSession({ controllerId, onClose }: { controllerId: number; onClose: () => void }) {
  const model = useConfigurationSessionState({ controllerId, onClose });

  return (
    <main
      className="wg:mx-auto wg:flex wg:w-full wg:max-w-[1440px] wg:min-w-0 wg:flex-col wg:gap-5 wg:p-4 wg:md:p-6"
      aria-label={model.t('editor.title')}
    >
      <header className="wg:flex wg:flex-col wg:gap-4">
        <Button variant="ghost" isDisabled={model.busy} onPress={model.close}>
          <ArrowLeft className="wg:size-4" /> {model.t('controllers.title')}
        </Button>
        <div className="wg:flex wg:flex-wrap wg:items-start wg:justify-between wg:gap-4">
          <div>
            <p className="wg:text-sm wg:font-medium wg:text-muted">
              WAGO / {model.diagnostics.data?.name ?? model.t('editor.controller', { id: controllerId })}
            </p>
            <h1 className="wg:mt-1 wg:text-3xl wg:font-semibold">{model.t('editor.title')}</h1>
            <p className="wg:mt-2 wg:text-muted">{model.t('editor.description')}</p>
          </div>
          {model.diagnostics.data && (
            <Chip variant="soft">{model.t('editor.runtime', { version: model.diagnostics.data.runtimeVersion })}</Chip>
          )}
        </div>
      </header>
      <ConfigurationToolbar
        snapshot={model.snapshot}
        dirty={model.dirty}
        draft={model.draft.data}
        baseline={model.baseline.data}
        editingDisabled={model.editingDisabled}
        hasErrors={model.modbusErrors.length > 0}
        saving={model.save.isPending || model.validate.isPending}
        busy={model.busy}
        initialized={model.initialized}
        onSave={() => void model.saveDraft()}
        onReview={() => model.setSection('review')}
      />
      <DraftFeedback
        draft={model.draft}
        baseline={model.baseline}
        draftConflict={model.draftConflict}
        reloadSavedDraft={model.reloadSavedDraft}
        error={model.error}
        notice={model.notice}
        validate={model.validate}
        snapshot={model.snapshot}
        metadata={model.metadata}
      />
      <nav
        className="wg:flex wg:flex-wrap wg:gap-2 wg:border-b wg:border-border wg:pb-3"
        aria-label={model.t('editor.sections')}
      >
        {(
          [
            { id: 'channels', icon: Settings2 },
            { id: 'devices', icon: Network },
            { id: 'review', icon: GitCompareArrows },
            { id: 'history', icon: History },
            { id: 'diagnostics', icon: Activity },
          ] as const
        ).map((item) => (
          <Button
            key={item.id}
            variant={model.section === item.id ? 'secondary' : 'ghost'}
            aria-current={model.section === item.id ? 'page' : undefined}
            isDisabled={model.busy}
            onPress={() => model.setSection(item.id)}
          >
            <item.icon className="wg:size-4" />
            {model.t(`editor.${item.id}`)}
          </Button>
        ))}
      </nav>
      {model.initialized && (
        <>
          <ConfigurationSessionForm
            {...{
              saveDraft: model.saveDraft,
              editingDisabled: model.editingDisabled,
              t: model.t,
              section: model.section,
              focusChannelId: model.focusChannelId,
              snapshot: model.snapshot,
              metadata: model.metadata,
              edit: model.edit,
              editMetadata: model.editMetadata,
              setSection: model.setSection,
              controllerId,
              setPresetBusy: model.setPresetBusy,
              setMetadata: model.setMetadata,
              setFocusChannelId: model.setFocusChannelId,
              setNotice: model.setNotice,
            }}
          />
          {model.modbusErrors.length > 0 && (
            <Card>
              <Card.Header>
                <Card.Title>{model.t('editor.needsAttention')}</Card.Title>
                <Card.Description>{model.t('editor.resolveAssignments')}</Card.Description>
              </Card.Header>
              <Card.Content>
                <ConfigurationErrors
                  errors={model.modbusErrors}
                  snapshot={model.snapshot}
                  names={model.metadata.names}
                />
              </Card.Content>
            </Card>
          )}
          <div hidden={model.section !== 'review'} className="wg:space-y-4">
            <LocalDraftReview
              dirty={model.dirty}
              hasDraft={!!model.draft.data}
              disabled={model.busy || model.draftConflict}
              validate={model.validate}
              snapshot={model.snapshot}
              metadata={model.metadata}
              setError={model.setError}
            />
          </div>
          <ConfigurationSessionContent
            {...{
              section: model.section,
              controllerId,
              metadata: model.metadata,
              generation: model.generation,
              reviewDisabled: model.reviewDisabled,
              draft: model.draft,
              setRevisionBusy: model.setRevisionBusy,
              setInitialized: model.setInitialized,
              setNotice: model.setNotice,
              setError: model.setError,
              loadedDraft: model.loadedDraft,
              setDraftConflict: model.setDraftConflict,
              setSnapshot: model.setSnapshot,
              setMetadata: model.setMetadata,
              setDirty: model.setDirty,
              setGeneration: model.setGeneration,
            }}
          />
        </>
      )}
      <div hidden={model.section !== 'diagnostics'}>
        <ControllerDiagnostics controllerId={controllerId} />
      </div>
      <Modal isOpen={model.discard} onOpenChange={model.setDiscard}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>{model.t('editor.discard')}</Modal.Heading>
              </Modal.Header>
              <Modal.Body>{model.t('editor.draftRemains')}</Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onPress={() => model.setDiscard(false)}>
                  {model.t('editor.keepEditing')}
                </Button>
                <Button
                  variant="danger"
                  onPress={() => {
                    model.client.removeQueries({ queryKey: model.localKey, exact: true });
                    onClose();
                  }}
                >
                  {model.t('editor.discardAndClose')}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </main>
  );
}

export type Section = 'channels' | 'devices' | 'review' | 'history' | 'diagnostics';

export interface WorkingCopy {
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
  source: string | null;
}
