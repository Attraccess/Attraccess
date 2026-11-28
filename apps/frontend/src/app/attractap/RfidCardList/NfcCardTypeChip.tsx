// Marks a UID-only RFID card in the lists: it can be copied, and it does not work while the setting is off
// FEATURE: UID-only RFID cards
import { Chip } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { NfcCard, useGetCardWriterSettings } from '@attraccess/react-query-client';
import de from './de.json';
import en from './en.json';

export function NfcCardTypeChip({ card }: Readonly<{ card: Pick<NfcCard, 'type'> }>) {
  const { t } = useTranslations({ de, en });
  const uidOnly = card.type === 'uid-only';
  // Only a UID-only card needs the setting; secure rows ask for nothing.
  const { data: settings } = useGetCardWriterSettings({}, undefined, { enabled: uidOnly });
  if (!uidOnly) return null;
  // Until the setting is known the card is shown as it usually is: allowed is the exception, but "disabled" would be a claim.
  const disabled = settings ? settings.allowUidOnlyCards !== true : false;
  return (
    <Chip variant="soft" color="warning" data-testid="nfc-card-uid-only-chip">
      {t(disabled ? 'nfcCardsTable.type.uidOnlyDisabled' : 'nfcCardsTable.type.uidOnly')}
    </Chip>
  );
}
