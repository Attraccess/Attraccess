import { Button, Card } from '@heroui/react';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from './api';
import { useConfigurationActions } from './queries';
import { ConfigurationErrors } from './ConfigurationChanges';
import { useWagoTranslations } from './i18n';

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
