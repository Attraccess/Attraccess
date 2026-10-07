import { Alert } from '@heroui/react';
import { Checkbox } from '@heroui/react';
import type { ConfigurationImpact } from './api';
import { useWagoTranslations } from './i18n';
import type { ConfigurationValidationError } from './api';
import { useConfigurationRevisionPreviewQuery } from './queries';
import { ConfigurationErrors } from './ConfigurationChanges';
import { readMetadata } from './configuration-model';
import { Button } from '@heroui/react';
import { useConfigurationActions } from './queries';
import { ConfigurationChanges } from './ConfigurationChanges';
import { ConfigurationMetadataChanges } from './ConfigurationChanges';

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
      <Alert.Indicator />
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
                    {t('revisions.reference', {
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

export function ReviewedDraft({
  review,
  names,
  disabled,
  force,
  onForceChange,
  publishing,
  onPublish,
}: {
  review: NonNullable<ReturnType<typeof useConfigurationActions>['review']['data']>;
  names: Record<string, string>;
  disabled: boolean;
  force: boolean;
  onForceChange: (force: boolean) => void;
  publishing: boolean;
  onPublish: (reviewedHash: string) => void;
}) {
  const { t } = useWagoTranslations();
  const reviewedHash = review.draft.reviewedHash;
  return (
    <>
      <ConfigurationChanges
        changes={review.diff}
        before={review.previous ? JSON.parse(review.previous.snapshot) : null}
        after={JSON.parse(review.draft.snapshot)}
        names={names}
      />
      <ConfigurationMetadataChanges changes={review.metadataDiff ?? []} names={names} />
      <ImpactWarning impacts={review.impacts} names={names} acknowledged={force} onChange={onForceChange} />
      <Button
        isDisabled={disabled || !reviewedHash || (!!review.impacts.length && !force)}
        isPending={publishing}
        onPress={() => {
          if (reviewedHash) onPublish(reviewedHash);
        }}
      >
        {t('revisions.publish')}
      </Button>
    </>
  );
}
