import { Button } from '@attraccess/plugins-frontend-ui';
import type { ConfigurationReview } from '../api/client';
import { useWagoTranslations } from '../i18n';
import { ConfigurationChanges, ConfigurationMetadataChanges } from './ConfigurationChanges';
import { ImpactWarning } from './ImpactWarning';

export function ReviewedDraft({
  review,
  names,
  disabled,
  force,
  onForceChange,
  publishing,
  onPublish,
}: {
  review: ConfigurationReview;
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
