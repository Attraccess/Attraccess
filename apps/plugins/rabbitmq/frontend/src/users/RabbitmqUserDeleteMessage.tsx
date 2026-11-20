import { StatusAlert, type TranslationMessage } from '@attraccess/plugins-frontend-ui';
import { type Ref, useImperativeHandle, useState } from 'react';
import { useRabbitmqTranslations } from '../i18n';
import { errorTitle } from './errorTitle';

export interface RabbitmqUserDeleteMessageHandle {
  showError: (error: string | TranslationMessage | null) => void;
}

// Body of the delete confirmation; it shows a failed attempt's error while the dialog stays open.
export function RabbitmqUserDeleteMessage({ name, ref }: { name: string; ref: Ref<RabbitmqUserDeleteMessageHandle> }) {
  const { t, tMessage } = useRabbitmqTranslations();
  const [error, setError] = useState<string | TranslationMessage | null>(null);
  useImperativeHandle(ref, () => ({ showError: setError }), []);

  return (
    <div className="rmq:flex rmq:flex-col rmq:gap-3">
      <p>{t('users.deleteDescription', { name })}</p>
      {error && (
        <StatusAlert
          status="danger"
          title={errorTitle(error, t('users.deleteError'))}
          data-cy="rabbitmq-user-delete-error-alert"
        >
          {tMessage(error)}
        </StatusAlert>
      )}
    </div>
  );
}
