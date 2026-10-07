import { Button } from '@heroui/react';
import { useConfigurationActions } from './queries';
import { ConfigurationChanges, ConfigurationMetadataChanges } from './ConfigurationChanges';
import { useWagoTranslations } from './i18n';
import { ImpactWarning } from './ConfigurationRevisions.helpers';

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
  return (
    <>
      <h3>{t('revisions.restore', { revision: preview.revision.revision })}</h3>
      <p>{t('revisions.restoreDescription')}</p>
      <ConfigurationChanges
        changes={preview.diff}
        before={preview.current ? JSON.parse(preview.current.snapshot) : null}
        after={JSON.parse(preview.revision.snapshot)}
        names={names}
      />
      <ConfigurationMetadataChanges changes={preview.metadataDiff ?? []} names={names} />
      <ImpactWarning impacts={preview.impacts} names={names} acknowledged={force} onChange={onForceChange} />
      <Button variant="danger" isDisabled={disabled || (!!preview.impacts.length && !force)} onPress={onPublish}>
        {t('revisions.publishRollback')}
      </Button>
      <Button variant="secondary" isDisabled={busy} onPress={onCancel}>
        {t('revisions.cancelRollback')}
      </Button>
    </>
  );
}
