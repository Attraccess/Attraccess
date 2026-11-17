import { AlertStatusIcon, Button } from '@attraccess/plugins-frontend-ui';
import { Alert } from '@heroui/react';
import type { RevisionPreview } from '../api/client';
import { useWagoTranslations } from '../i18n';
import { ConfigurationChanges, ConfigurationErrors, ConfigurationMetadataChanges } from './ConfigurationChanges';
import { ImpactWarning } from './ImpactWarning';

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
  preview: RevisionPreview;
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
