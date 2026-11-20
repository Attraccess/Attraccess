// Shows whether an RFID card is the active one, now that the row actions no longer reveal it
// FEATURE: RFID card list
import { Chip } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';

export function NfcCardStatusChip({ isActive }: Readonly<{ isActive: boolean }>) {
  const { t } = useTranslations({ de, en });
  return (
    <Chip variant="soft" color={isActive ? 'success' : 'default'}>
      {t(isActive ? 'nfcCardsTable.status.active' : 'nfcCardsTable.status.inactive')}
    </Chip>
  );
}
