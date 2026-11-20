import { Button } from '@heroui/react';
import { useState } from 'react';
import { useMatterTranslations } from '../i18n';

/** "Try again" under a load error; shows it is working until the new request is answered. */
export function RetryButton({
  onRetry,
  'data-cy': dataCy,
}: Readonly<{ onRetry: () => Promise<unknown>; 'data-cy': string }>) {
  const { t } = useMatterTranslations();
  const [pending, setPending] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      className="mt:mt-2"
      isPending={pending}
      onPress={() => {
        setPending(true);
        void onRetry().finally(() => setPending(false));
      }}
      data-cy={dataCy}
    >
      {t('devices.retry')}
    </Button>
  );
}
