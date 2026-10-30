import { Button, Card } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Attractap,
  useAttractapServiceGetPairings,
  useAttractapServiceRequestReaderPairing,
} from '@attraccess/react-query-client';
import { useEffect, useRef, useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { PairingDialog } from './PairingDialog';
import { WaitingDeviceSummary } from './WaitingDeviceSummary';
import { apiErrorMessage, isPairingRunning } from './pairingUtils';
import de from './de.json';
import en from './en.json';

const PAIRING_REQUEST_TIMEOUT_MS = 30_000;

interface OpenPairing {
  id: string;
  /** Set for readers that signed in with their token; their pairing starts without a choice. */
  readerId?: number;
}

/**
 * Everything that still needs pairing: readers that sign in with their token and devices that
 * announced themselves without a valid pairing. The only action here is to pair.
 */
export function ReadersToPair(props: Readonly<{ readers: Attractap[] }>) {
  const { t } = useTranslations({ de, en });
  const toast = useToastMessage();
  const [awaitingReaderId, setAwaitingReaderId] = useState<number | null>(null);
  const [openPairing, setOpenPairing] = useState<OpenPairing | null>(null);

  const { data: pairings } = useAttractapServiceGetPairings(undefined, {
    refetchInterval: awaitingReaderId !== null ? 1000 : 3000,
  });
  const running = (pairings ?? []).filter((p) => isPairingRunning(p.state));
  const runningFor = (readerId: number) => running.find((p) => p.boundReaderId === readerId);

  const unpairedReaders = props.readers.filter((reader) => reader.pairingState === 'unpaired');
  // Readers bound to a record are listed with that record above.
  const devices = running.filter((p) => p.boundReaderId === null);

  const requestPairing = useAttractapServiceRequestReaderPairing({
    onSuccess: (result, { readerId }) => {
      if (result.requested) {
        setAwaitingReaderId(readerId);
      } else {
        toast.error({ title: t('toPair.notConnected') });
      }
    },
    onError: (error) => toast.error({ title: t('toPair.requestFailed'), description: apiErrorMessage(error) }),
  });

  // Give up waiting when the reader never opens a pairing connection.
  const onNoResponse = useRef(() => undefined as void);
  onNoResponse.current = () => {
    setAwaitingReaderId(null);
    toast.error({ title: t('toPair.noResponse') });
  };
  useEffect(() => {
    if (awaitingReaderId === null) return;
    const timer = setTimeout(() => onNoResponse.current(), PAIRING_REQUEST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [awaitingReaderId]);

  // A reader that was asked to pair connects to the pairing endpoint; open its pairing.
  const arrived = awaitingReaderId !== null ? runningFor(awaitingReaderId) : undefined;
  useEffect(() => {
    if (!arrived || awaitingReaderId === null) return;
    setAwaitingReaderId(null);
    setOpenPairing({ id: arrived.id, readerId: awaitingReaderId });
  }, [arrived, awaitingReaderId]);

  return (
    <>
      {(unpairedReaders.length > 0 || devices.length > 0) && (
        <Card className="p-4 flex flex-col gap-3" data-cy="attractap-readers-to-pair">
          <div>
            <h2 className="text-lg font-semibold">{t('toPair.title')}</h2>
            <p className="text-sm text-default-500">{t('toPair.description')}</p>
          </div>
          <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
            {unpairedReaders.map((reader) => {
              const pairing = runningFor(reader.id);
              return (
                <div key={`reader-${reader.id}`} className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span>{reader.name}</span>
                    <span className="text-xs text-default-500">{t('toPair.signsInWithToken')}</span>
                  </div>
                  <Button
                    size="sm"
                    isPending={
                      awaitingReaderId === reader.id ||
                      (requestPairing.isPending && requestPairing.variables?.readerId === reader.id)
                    }
                    onPress={() =>
                      pairing
                        ? setOpenPairing({ id: pairing.id, readerId: reader.id })
                        : requestPairing.mutate({ readerId: reader.id })
                    }
                    data-cy={`attractap-pair-reader-${reader.id}`}
                  >
                    {pairing ? t('toPair.resume') : t('toPair.pair')}
                  </Button>
                </div>
              );
            })}
            {devices.map((pairing) => (
              <div key={pairing.id} className="flex items-center justify-between gap-2">
                <WaitingDeviceSummary pairing={pairing} />
                <Button
                  size="sm"
                  onPress={() => setOpenPairing({ id: pairing.id })}
                  data-cy={`attractap-pair-device-${pairing.id}`}
                >
                  {pairing.mode ? t('toPair.resume') : t('toPair.pair')}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
      {/* Stays mounted when the card empties, so the dialog can show how the pairing ended. */}
      <PairingDialog
        pairingId={openPairing?.id ?? null}
        autoStartMode={openPairing?.readerId !== undefined ? 'pair' : undefined}
        onClose={() => setOpenPairing(null)}
      />
    </>
  );
}
