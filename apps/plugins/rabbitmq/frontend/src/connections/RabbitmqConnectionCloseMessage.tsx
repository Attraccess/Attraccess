import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Input, Label, TextField } from '@heroui/react';
import { type Ref, useImperativeHandle, useState } from 'react';
import { useRabbitmqTranslations } from '../i18n';

export interface RabbitmqConnectionCloseMessageHandle {
  reason: string;
  showError: (error: string | null) => void;
}

// Body of the close confirmation: the optional reason, and a failed attempt's error while the dialog stays open.
export function RabbitmqConnectionCloseMessage({
  name,
  ref,
}: {
  name: string;
  ref: Ref<RabbitmqConnectionCloseMessageHandle>;
}) {
  const { t } = useRabbitmqTranslations();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  useImperativeHandle(ref, () => ({ reason, showError: setError }), [reason]);

  return (
    <div className="rmq:flex rmq:flex-col rmq:gap-3">
      <p>{t('connections.closeDescription', { name })}</p>
      <TextField value={reason} onChange={setReason} className="rmq:w-full">
        <Label>{t('connections.reason')}</Label>
        <Input autoComplete="off" data-cy="rabbitmq-connection-close-reason-input" />
      </TextField>
      {error && (
        <StatusAlert status="danger" title={t('connections.closeError')} data-cy="rabbitmq-connection-close-error">
          {error === t('connections.closeError') ? undefined : error}
        </StatusAlert>
      )}
    </div>
  );
}
