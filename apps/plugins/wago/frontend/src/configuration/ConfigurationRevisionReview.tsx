import { AlertStatusIcon, Button } from '@attraccess/plugins-frontend-ui';
import { Alert, Checkbox } from '@heroui/react';
import { ConfigurationChanges, ConfigurationErrors, ConfigurationMetadataChanges } from './ConfigurationChanges';
import type { ConfigurationImpact, ConfigurationValidationError } from '../api/client';
import { readMetadata } from './model';
import { useWagoTranslations } from '../i18n';
import { useConfigurationActions, useConfigurationRevisionPreviewQuery } from '../api/queries';

export function RejectionErrors({
  value,
  controllerId,
  revision,
  names,
}: {
  value: string | null;
  controllerId: number;
  revision: number;
  names: Record<string, string>;
}) {
  const { t } = useWagoTranslations();
  const preview = useConfigurationRevisionPreviewQuery(controllerId, revision, !!value);
  if (!value) return null;
  if (preview.isPending) return <p>{t('revisions.loadingRejected')}</p>;
  if (preview.isError) return <p>{t('revisions.rejectedError', { error: preview.error.message })}</p>;
  try {
    const errors = JSON.parse(value) as ConfigurationValidationError[];
    if (!Array.isArray(errors)) throw new Error('invalid errors');
    return (
      <ConfigurationErrors
        errors={errors}
        snapshot={JSON.parse(preview.data.revision.snapshot)}
        names={{ ...names, ...readMetadata(preview.data.revision.presetProvenance ?? null).names }}
      />
    );
  } catch {
    return <p>{t('revisions.rejectedUnreadable')}</p>;
  }
}

export function RollbackReview({
  preview,
  names,
  force,
  onForceChange,
  disabled,
  busy,
  onPublish,
  onCancel,
}: {
  preview: NonNullable<ReturnType<typeof useConfigurationActions>['preview']['data']>;
  names: Record<string, string>;
  force: boolean;
  onForceChange: (force: boolean) => void;
  disabled: boolean;
  busy: boolean;
  onPublish: () => void;
  onCancel: () => void;
}) {
  const { t } = useWagoTranslations();
  const snapshot = JSON.parse(preview.revision.snapshot);
  const errors = preview.errors ?? [];
  return (
    <>
      <h3>{t('revisions.restore', { revision: preview.revision.revision })}</h3>
      <p>{t('revisions.restoreDescription')}</p>
      <ConfigurationChanges
        changes={preview.diff}
        before={preview.current ? JSON.parse(preview.current.snapshot) : null}
        after={snapshot}
        names={names}
      />
      <ConfigurationMetadataChanges changes={preview.metadataDiff ?? []} names={names} />
      {errors.length > 0 && (
        <Alert status="danger">
          <AlertStatusIcon status="danger" />
          <Alert.Content>
            <Alert.Title>{t('revisions.rollbackInvalid')}</Alert.Title>
            <ConfigurationErrors errors={errors} snapshot={snapshot} names={names} />
          </Alert.Content>
        </Alert>
      )}
      <ImpactWarning impacts={preview.impacts} names={names} acknowledged={force} onChange={onForceChange} />
      <Button
        variant="danger"
        isDisabled={disabled || errors.length > 0 || (!!preview.impacts.length && !force)}
        onPress={onPublish}
      >
        {t('revisions.publishRollback')}
      </Button>
      <Button variant="secondary" isDisabled={busy} onPress={onCancel}>
        {t('revisions.cancelRollback')}
      </Button>
    </>
  );
}

export function ImpactWarning({
  impacts,
  names,
  acknowledged,
  onChange,
}: {
  impacts: ConfigurationImpact[];
  names: Record<string, string>;
  acknowledged: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
  if (!impacts.length) return null;
  return (
    <Alert status="warning">
      <AlertStatusIcon status="warning" />
      <Alert.Content>
        <Alert.Title>{t('revisions.impacts')}</Alert.Title>
        <Alert.Description>{t('revisions.impactDescription')}</Alert.Description>
        <ul>
          {impacts.map((impact) => (
            <li key={impact.channelId}>
              {names[impact.channelId] ?? impact.channelId}: {tBackendMessage(impact.message)}
              {impact.references.length ? (
                impact.references.map((reference) => (
                  <p key={reference.nodeId}>
                    {reference.flowId != null
                      ? t('revisions.globalReference', {
                          flow: reference.flowName ?? `#${reference.flowId}`,
                          node: reference.nodeId,
                          type: reference.nodeType,
                        })
                      : t('revisions.reference', {
                          resource: reference.resourceId,
                          node: reference.nodeId,
                          type: reference.nodeType,
                        })}
                  </p>
                ))
              ) : (
                <p>{t('revisions.noReferences')}</p>
              )}
            </li>
          ))}
        </ul>
        <Checkbox isSelected={acknowledged} onChange={onChange}>
          <Checkbox.Content className="wg:items-start">
            <Checkbox.Control className="wg:mt-0.5">
              <Checkbox.Indicator />
            </Checkbox.Control>
            {t('revisions.accept')}
          </Checkbox.Content>
        </Checkbox>
      </Alert.Content>
    </Alert>
  );
}
