import type { ConfigurationValidationError } from '../api/client';
import { useConfigurationRevisionPreviewQuery } from '../api/queries';
import { useWagoTranslations } from '../i18n';
import { ConfigurationErrors } from './ConfigurationChanges';
import { readMetadata } from './model';

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
