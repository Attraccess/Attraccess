import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PairingDto } from '@attraccess/react-query-client';
import de from './de.json';
import en from './en.json';

export function PairingResult({ current }: Readonly<{ current: PairingDto }>) {
  const { t } = useTranslations({ de, en });
  return (
    <div className="flex flex-col gap-1" data-cy="attractap-pairing-result">
      <p>{t(`dialog.${current.state}`)}</p>
      {current.failureReason && (
        <p className="text-sm text-default-500" data-cy="attractap-pairing-failure-reason">
          {t(`dialog.reason.${current.failureReason}`)}
        </p>
      )}
    </div>
  );
}
