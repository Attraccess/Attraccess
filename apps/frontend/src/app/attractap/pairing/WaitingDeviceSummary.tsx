import { Chip } from '@heroui/react';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { PairingDto } from '@attraccess/react-query-client';
import de from './de.json';
import en from './en.json';

/** Kind, key and announcement time of a device waiting to pair, so an admin can tell devices apart. */
export function WaitingDeviceSummary(props: Readonly<{ pairing: PairingDto }>) {
  const { pairing } = props;
  const { t } = useTranslations({ de, en });
  const format = useDateTimeFormatter();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Chip>{t(`waiting.kind.${pairing.kind}`)}</Chip>
        <span className="font-mono text-sm">{t('waiting.key', { fingerprint: pairing.keyFingerprint })}</span>
      </div>
      <span className="text-xs text-default-500">{t('waiting.announcedAt', { time: format(pairing.createdAt) })}</span>
    </div>
  );
}
