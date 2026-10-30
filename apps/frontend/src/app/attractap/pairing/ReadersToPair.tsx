import { Button, Card } from '@heroui/react';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Attractap,
  useAttractapServiceGetPairings,
  useAttractapServiceRequestReaderPairing,
} from '@attraccess/react-query-client';
import { useEffect, useRef, useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { DevicePicker, devicesWaiting } from './DevicePicker';
import { PairingDialog } from './PairingDialog';
import { PairingRow, readerKindOf } from './PairingRow';
import { apiErrorMessage, isPairingRunning } from './pairingUtils';
import de from './de.json';
import en from './en.json';

const PAIRING_REQUEST_TIMEOUT_MS = 30_000;

interface OpenPairing {
  id: string;
  mode?: 'pair' | 'repair';
  targetReaderId?: number;
}

/**
 * Everything that must be paired before it can be used: readers that were never paired, readers
 * whose pairing was removed, and new readers that announced themselves. The only action is Pair.
 */
export function ReadersToPair(props: Readonly<{ readers: Attractap[]; onPaired: (readerId: number) => void }>) {
  const { t } = useTranslations({ de, en });
  const format = useDateTimeFormatter();
  const toast = useToastMessage();
  const [awaitingReaderId, setAwaitingReaderId] = useState<number | null>(null);
  const [pickerFor, setPickerFor] = useState<Attractap | null>(null);
  const [openPairing, setOpenPairing] = useState<OpenPairing | null>(null);

  const { data: pairings } = useAttractapServiceGetPairings(undefined, {
    refetchInterval: awaitingReaderId !== null || pickerFor ? 1000 : 3000,
  });
  const running = (pairings ?? []).filter((p) => isPairingRunning(p.state));
  const runningFor = (readerId: number) =>
    running.find((p) => p.boundReaderId === readerId || (p.mode && p.targetReaderId === readerId));

  const readers = props.readers.filter((reader) => reader.pairingState !== 'paired');
  // Devices already bound or targeted to a record are listed with that record.
  const devices = running.filter((p) => p.boundReaderId === null && !(p.mode && p.targetReaderId !== null));

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

  // Give up waiting when the reader never starts pairing (it is off or its software is too old).
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

  // A reader that was asked to pair connects to the server; open its pairing.
  const arrived = awaitingReaderId !== null ? runningFor(awaitingReaderId) : undefined;
  useEffect(() => {
    if (!arrived) return;
    setAwaitingReaderId(null);
    setOpenPairing({ id: arrived.id, mode: 'pair' });
  }, [arrived]);

  const pair = (reader: Attractap) => {
    const pairing = runningFor(reader.id);
    if (pairing) setOpenPairing({ id: pairing.id, mode: pairing.mode === 'repair' ? 'repair' : 'pair' });
    // A reader whose pairing was removed comes back as a new reader; the admin picks which one it is.
    else if (reader.pairingState === 'revoked') setPickerFor(reader);
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
                    isPending={
                      awaitingReaderId === reader.id ||
                      (requestPairing.isPending && requestPairing.variables?.readerId === reader.id)
                    }
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
                    onPress={() => setOpenPairing({ id: pairing.id })}
                    data-cy={`attractap-pair-device-${pairing.id}`}
                  >
                    {pairing.mode ? t('toPair.resume') : t('toPair.pair')}
                  </Button>
                }
              />
            ))}
          </div>
        </Card>
      )}

      <DevicePicker
        title={pickerFor ? t('picker.title', { name: pickerFor.name }) : null}
        devices={devicesWaiting(pairings)}
        onPick={(pairingId) => {
          if (pickerFor) setOpenPairing({ id: pairingId, mode: 'repair', targetReaderId: pickerFor.id });
          setPickerFor(null);
        }}
        onClose={() => setPickerFor(null)}
      />

      {/* Stays mounted when the card empties, so a failed pairing can still say why. */}
      <PairingDialog
        pairingId={openPairing?.id ?? null}
        autoStartMode={openPairing?.mode}
        presetTargetReaderId={openPairing?.targetReaderId}
        onClose={() => setOpenPairing(null)}
        onPaired={(readerId) => {
          setOpenPairing(null);
          props.onPaired(readerId);
        }}
      />
    </>
  );
}
