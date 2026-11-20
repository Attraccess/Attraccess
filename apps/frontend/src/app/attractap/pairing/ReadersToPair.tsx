import { Button, Card } from '@heroui/react';
import { Trash2Icon } from 'lucide-react';
import { ConfirmableButton, PageHeader, useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Attractap,
  useDeleteReader,
  useGetPairings,
  UseGetReadersKeyFn,
  UseGetReadersToPairKeyFn,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { PairingDialog, PairingDialogProps } from './PairingDialog';
import { PairingRow, readerKindOf } from './PairingRow';
import { apiErrorMessage, isPairingRunning } from './pairingUtils';
import de from './de.json';
import en from './en.json';

type OpenDialog = Pick<PairingDialogProps, 'pairingId' | 'presetTargetReaderId'>;

/** Actions of a reader record whose pairing was removed: pair it again or delete it. */
function RecordActions(props: Readonly<{ reader: Attractap; pair: ReactNode }>) {
  // React escapes the output; escaping the reader name again would show `&amp;` in the confirmation.
  const { t } = useTranslations({ de, en }, { escapeValues: false });
  const { reader } = props;
  const queryClient = useQueryClient();
  const toast = useToastMessage();
  const deleteReader = useDeleteReader(undefined, {
    onSuccess: () => {
      // The deleted record can be in either list.
      queryClient.invalidateQueries({ queryKey: UseGetReadersKeyFn() });
      queryClient.invalidateQueries({ queryKey: UseGetReadersToPairKeyFn() });
    },
    onError: (error) => toast.error({ title: t('toPair.deleteFailed'), description: apiErrorMessage(error) }),
  });
  return (
    <div className="flex items-center gap-1">
      {props.pair}
      <ConfirmableButton
        label={t('toPair.delete')}
        status="error"
        confirm={{
          title: t('toPair.deleteTitle', { name: reader.name }),
          message: t('toPair.deleteMessage', { name: reader.name }),
        }}
        isPending={deleteReader.isPending}
        onConfirm={() => deleteReader.mutateAsync({ path: { readerId: reader.id } })}
        renderActivator={(open) => (
          <Button
            size="sm"
            variant="danger-soft"
            isIconOnly
            aria-label={t('toPair.delete')}
            onPress={open}
            data-cy={`attractap-to-pair-delete-${reader.id}`}
          >
            <Trash2Icon className="size-4" />
          </Button>
        )}
      />
    </div>
  );
}

/**
 * Everything that must be paired before it can be used: readers whose pairing was removed and new readers that
 * wait for approval. Reader records can also be deleted; a new reader can only be paired. Codes are never shown
 * here; the admin reads them from the reader.
 */
export function ReadersToPair(props: Readonly<{ readers: Attractap[]; onPaired: (readerId: number) => void }>) {
  const { t } = useTranslations({ de, en });
  const format = useDateTimeFormatter();
  const [dialog, setDialog] = useState<OpenDialog | null>(null);

  const { data: pairings } = useGetPairings({}, undefined, { refetchInterval: 3000 });
  // Every waiting request is a reader that asks to be paired; a request only gets a record once it is approved.
  const running = (pairings ?? []).filter((p) => isPairingRunning(p.state));
  const readers = props.readers.filter((reader) => reader.pairingState !== 'paired');

  // The machines the record was linked to before its pairing was removed.
  const resourcesOf = (reader: Attractap) => {
    const names = (reader.resources ?? []).map((resource) => resource.name);
    return names.length > 0 ? t('toPair.resources', { names: names.join(', ') }) : undefined;
  };

  return (
    <>
      {(readers.length > 0 || running.length > 0) && (
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
                detail={t('toPair.pairingRemoved')}
                note={resourcesOf(reader)}
                noteCy={`attractap-to-pair-resources-${reader.id}`}
                action={
                  <RecordActions
                    reader={reader}
                    pair={
                      <Button
                        size="sm"
                        onPress={() => setDialog({ presetTargetReaderId: reader.id })}
                        data-cy={`attractap-pair-reader-${reader.id}`}
                      >
                        {t('toPair.pair')}
                      </Button>
                    }
                  />
                }
              />
            ))}
            {running.map((pairing) => (
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
