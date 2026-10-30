import { Button, Card } from '@heroui/react';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Attractap,
  useAttractapServiceGetPairings,
  useAttractapServiceRequestReaderPairing,
} from '@attraccess/react-query-client';
import { useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { PairingDialog, PairingDialogProps } from './PairingDialog';
import { PairingRow, readerKindOf } from './PairingRow';
import { apiErrorMessage, isPairingRunning } from './pairingUtils';
import de from './de.json';
import en from './en.json';

type OpenDialog = Pick<PairingDialogProps, 'pairingId' | 'waitForReaderId' | 'presetTargetReaderId'>;

/**
 * Everything that must be paired before it can be used: readers that were never paired, readers
 * whose pairing was removed, and new readers that wait for approval. The only action is Pair.
 * Codes are never shown here; the admin reads them from the reader.
 */
export function ReadersToPair(props: Readonly<{ readers: Attractap[]; onPaired: (readerId: number) => void }>) {
  const { t } = useTranslations({ de, en });
  const format = useDateTimeFormatter();
  const toast = useToastMessage();
  const [dialog, setDialog] = useState<OpenDialog | null>(null);

  const { data: pairings } = useAttractapServiceGetPairings(undefined, { refetchInterval: 3000 });
  const running = (pairings ?? []).filter((p) => isPairingRunning(p.state));
  const runningFor = (readerId: number) => running.find((p) => p.boundReaderId === readerId);

  const readers = props.readers.filter((reader) => reader.pairingState !== 'paired');
  // Readers bound to a record are listed with that record.
  const devices = running.filter((p) => p.boundReaderId === null);

  const requestPairing = useAttractapServiceRequestReaderPairing({
    onSuccess: (result, { readerId }) => {
      if (result.requested) setDialog({ waitForReaderId: readerId });
      else toast.error({ title: t('toPair.notConnected') });
    },
    onError: (error) => toast.error({ title: t('toPair.requestFailed'), description: apiErrorMessage(error) }),
  });

  const pair = (reader: Attractap) => {
    const pairing = runningFor(reader.id);
    if (pairing) setDialog({ pairingId: pairing.id });
    // A reader whose pairing was removed comes back as a new reader; the admin says which record it takes over.
    else if (reader.pairingState === 'revoked') setDialog({ presetTargetReaderId: reader.id });
    else requestPairing.mutate({ readerId: reader.id });
  };

  return (
    <>
      {(readers.length > 0 || devices.length > 0) && (
        <Card className="p-4 flex flex-col gap-3" data-cy="attractap-readers-to-pair">
          <div>
            <h2 className="text-lg font-semibold">{t('toPair.title')}</h2>
            <p className="text-sm text-default-500">{t('toPair.description')}</p>
          </div>
          <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
            {readers.map((reader) => (
              <PairingRow
                key={`reader-${reader.id}`}
                kind={readerKindOf(reader.firmware)}
                name={reader.name}
                detail={t(reader.pairingState === 'revoked' ? 'toPair.pairingRemoved' : 'toPair.neverPaired')}
                action={
                  <Button
                    size="sm"
                    isPending={requestPairing.isPending && requestPairing.variables?.readerId === reader.id}
                    onPress={() => pair(reader)}
                    data-cy={`attractap-pair-reader-${reader.id}`}
                  >
                    {runningFor(reader.id) ? t('toPair.resume') : t('toPair.pair')}
                  </Button>
                }
              />
            ))}
            {devices.map((pairing) => (
              <PairingRow
                key={pairing.id}
                kind={pairing.kind}
                name={t('toPair.newReader')}
                detail={t('toPair.waitingSince', { time: format(pairing.createdAt) })}
                action={
                  <Button
                    size="sm"
                    onPress={() => setDialog({ pairingId: pairing.id })}
                    data-cy={`attractap-pair-device-${pairing.id}`}
                  >
                    {t('toPair.pair')}
                  </Button>
                }
              />
            ))}
          </div>
        </Card>
      )}

      {/* Mounted with its own content only while open, so every pairing starts fresh. */}
      <PairingDialog
        isOpen={dialog !== null}
        {...dialog}
        onClose={() => setDialog(null)}
        onPaired={(readerId) => {
          setDialog(null);
          props.onPaired(readerId);
        }}
      />
    </>
  );
}
