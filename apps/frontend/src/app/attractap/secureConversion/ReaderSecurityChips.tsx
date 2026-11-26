import { Chip } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import type { Attractap, AttractapConversionState } from '@attraccess/react-query-client';
import { ConversionStateChip } from './ConversionStateChip';
import { isRunning } from './conversionStates';
// The reader editor's "Secure reader" chip (pairing/ReaderSecured) owns these labels; the list shows the same words.
import de from '../pairing/de.json';
import en from '../pairing/en.json';

interface Props {
  reader: Pick<Attractap, 'id' | 'secured' | 'firmwareProfile'>;
  /** State of the installation's active conversion when it is this reader's; null otherwise. */
  conversionState?: AttractapConversionState | null;
}

/** Secured, lab key, or the step of a running conversion: the reader list's security chips. */
export function ReaderSecurityChips({ reader, conversionState }: Readonly<Props>) {
  const { t } = useTranslations({ de, en });
  const running = conversionState && isRunning(conversionState) ? conversionState : null;
  if (!reader.secured && reader.firmwareProfile !== 'secure-lab' && !running) return null;
  return (
    <span className="ms-2 inline-flex flex-wrap gap-1 whitespace-nowrap">
      {reader.secured && (
        <Chip size="sm" variant="soft" color="success" data-cy={`attractap-secured-chip-${reader.id}`}>
          {t('secured.secured')}
        </Chip>
      )}
      {reader.firmwareProfile === 'secure-lab' && (
        <Chip size="sm" variant="soft" color="default" data-cy={`attractap-lab-key-chip-${reader.id}`}>
          {t('secured.labKey')}
        </Chip>
      )}
      {running && <ConversionStateChip state={running} />}
    </span>
  );
}
