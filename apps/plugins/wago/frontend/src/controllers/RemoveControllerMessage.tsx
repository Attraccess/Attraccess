import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { type Ref, useImperativeHandle, useState } from 'react';
import { useWagoTranslations } from '../i18n';

export interface RemoveControllerMessageHandle {
  showError: (error: string | null) => void;
}

// Body of the remove confirmation; it shows a failed attempt's error while the dialog stays open.
export function RemoveControllerMessage({ name, ref }: { name: string; ref: Ref<RemoveControllerMessageHandle> }) {
  const { t } = useWagoTranslations();
  const [error, setError] = useState<string | null>(null);
  useImperativeHandle(ref, () => ({ showError: setError }), []);

  return (
    <div className="wg:space-y-4">
      <p>{t('remove.question', { name })}</p>
      <StatusAlert status="warning">{t('remove.description')}</StatusAlert>
      {error && <StatusAlert status="danger">{error}</StatusAlert>}
    </div>
  );
}
