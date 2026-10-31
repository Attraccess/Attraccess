import { Button, Card } from '@heroui/react';
import { ActivityIcon, Trash2Icon } from 'lucide-react';
import { PageHeader, useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Attractap,
  useAttractapServiceGetPairings,
  useAttractapServiceRequestReaderPairing,
} from '@attraccess/react-query-client';
import { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToastMessage } from '../../../components/toastProvider';
import { AttractapDeleteModal } from '../AttractapList/delete';
import { PairingDialog, PairingDialogProps } from './PairingDialog';
import { PairingRow, readerKindOf } from './PairingRow';
import { apiErrorMessage, isPairingRunning } from './pairingUtils';
import de from './de.json';
import en from './en.json';

type OpenDialog = Pick<PairingDialogProps, 'pairingId' | 'waitForReaderId' | 'presetTargetReaderId'>;

/** Actions of a reader record that is not paired: pair it, look at its diagnostics, or delete it. */
function RecordActions(props: Readonly<{ readerId: number; pair: ReactNode }>) {
  const { t } = useTranslations({ de, en });
  const navigate = useNavigate();
  const { readerId } = props;
  return (
    <div className="flex items-center gap-1">
      {props.pair}
      <Button
        size="sm"
        variant="ghost"
        isIconOnly
        aria-label={t('toPair.diagnostics')}
        onPress={() => navigate(`/attractap/readers/${readerId}/diagnostics`)}
        data-cy={`attractap-to-pair-diagnostics-${readerId}`}
      >
        <ActivityIcon className="size-4" />
      </Button>
      <AttractapDeleteModal readerId={readerId}>
        {(onOpen) => (
          <Button
            size="sm"
            variant="danger-soft"
            isIconOnly
            aria-label={t('toPair.delete')}
            onPress={onOpen}
            data-cy={`attractap-to-pair-delete-${readerId}`}
          >
            <Trash2Icon className="size-4" />
          </Button>
        )}
      </AttractapDeleteModal>
    </div>
  );
}

/**
 * Everything that must be paired before it can be used: readers that were never paired, readers
 * whose pairing was removed, and new readers that wait for approval. Reader records can also be
 * deleted or diagnosed; a new reader can only be paired. Codes are never shown here; the admin
 * reads them from the reader.
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
        <Card data-cy="attractap-readers-to-pair">
          <Card.Header>
            <PageHeader noMargin title={t('toPair.title')} subtitle={t('toPair.description')} />
          </Card.Header>
          <Card.Content className="flex max-h-72 flex-col gap-3 overflow-y-auto">
            {readers.map((reader) => (
              <PairingRow
                key={`reader-${reader.id}`}
                kind={readerKindOf(reader.firmware)}
                name={reader.name}
                detail={t(reader.pairingState === 'revoked' ? 'toPair.pairingRemoved' : 'toPair.neverPaired')}
                action={
                  <RecordActions
                    readerId={reader.id}
                    pair={
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
          </Card.Content>
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
