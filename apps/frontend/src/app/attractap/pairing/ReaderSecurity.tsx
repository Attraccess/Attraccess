import { Button, Chip, Spinner } from '@heroui/react';
import {
  AttraccessUser,
  ConfirmableButton,
  useDateTimeFormatter,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import {
  Attractap,
  AttractapCredentialEvent,
  useGetPairings,
  useGetReaderCredentialHistory,
  useRevokeReader,
  useGetReadersKey,
  useGetReadersToPairKey,
  useGetReaderCredentialHistoryKey,
  UseGetReaderByIdKeyFn,
  useGetOneUserById,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { PairingDialog } from './PairingDialog';
import { PairingStateChip } from './PairingStateChip';
import { ReaderSecured } from './ReaderSecured';
import { SecureThisReader } from '../secureConversion/SecureThisReader';
import { apiErrorMessage, readerIdsWaitingToPair } from './pairingUtils';
import de from './de.json';
import en from './en.json';

/** The user behind a credential event; events without a user were caused by the reader or the system. */
function EventActor(props: Readonly<{ actorId: number | null }>) {
  const { actorId } = props;
  const { data: user, isError } = useGetOneUserById({ path: { id: actorId ?? 0 } }, undefined, {
    enabled: actorId !== null,
  });
  if (actorId === null) return <span>-</span>;
  if (isError) return <span>#{actorId}</span>;
  if (!user) return <Spinner size="sm" />;
  return <AttraccessUser user={user} interactive={false} />;
}

/** One action with a sentence that says what it does, so the buttons make sense on first sight. */
function SecurityAction(props: Readonly<{ description: string; children: ReactNode }>) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm text-default-500">{props.description}</p>
      {props.children}
    </div>
  );
}

/** The credential the reader uses now, or the latest one when the current key is not in the history. */
function currentPairedEvent(history: AttractapCredentialEvent[] | undefined, fingerprint: string | null) {
  const paired = (history ?? []).filter((event) => event.state === 'paired');
  const latestFirst = [...paired].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return latestFirst.find((event) => event.keyFingerprint === fingerprint) ?? latestFirst[0];
}

/** Shown for paired readers only; readers that are not paired can only be paired from the reader list. */
export function ReaderSecurity(props: Readonly<{ reader: Attractap; onPairingRemoved: () => void }>) {
  const { reader, onPairingRemoved } = props;
  const { t } = useTranslations({ de, en });
  const format = useDateTimeFormatter();
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [pairAgainOpen, setPairAgainOpen] = useState(false);

  const { data: history } = useGetReaderCredentialHistory({ path: { readerId: reader.id } });
  const { data: pairings } = useGetPairings({}, undefined, { refetchInterval: 5000 });

  const showError = (titleKey: string) => (error: unknown) =>
    toast.error({ title: t(titleKey), description: apiErrorMessage(error) });

  const revoke = useRevokeReader(undefined, {
    onSuccess: () => {
      toast.success({ title: t('security.revoked') });
      // The reader moves from the paired list to the one under Not paired.
      queryClient.invalidateQueries({ queryKey: [useGetReadersKey] });
      queryClient.invalidateQueries({ queryKey: [useGetReadersToPairKey] });
      queryClient.invalidateQueries({ queryKey: [useGetReaderCredentialHistoryKey] });
      queryClient.invalidateQueries({ queryKey: UseGetReaderByIdKeyFn({ path: { readerId: reader.id } }) });
      // A reader without pairing cannot be edited any more.
      onPairingRemoved();
    },
    onError: showError('security.revokeFailed'),
  });

  const waitingToPair = readerIdsWaitingToPair(pairings).has(reader.id);
  const pairedEvent = currentPairedEvent(history, reader.credentialFingerprint);

  return (
    <div className="flex flex-col gap-4" data-cy="attractap-security">
      <p className="text-sm text-default-500">{t('security.immediateHint')}</p>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t('security.state')}</h3>
        <PairingStateChip state={reader.pairingState} waiting={waitingToPair} />
      </div>

      <dl className="grid grid-cols-2 items-center gap-1 text-sm">
        <dt>{t('security.pairedAt')}</dt>
        <dd>{reader.pairedAt ? format(reader.pairedAt) : '-'}</dd>
        <dt>{t('security.pairedBy')}</dt>
        <dd data-cy="attractap-security-paired-by">
          <EventActor actorId={pairedEvent?.actorId ?? null} />
        </dd>
      </dl>

      <ReaderSecured reader={reader} />

      <SecureThisReader reader={reader} />

      <div className="flex flex-col gap-3">
        <h3 className="font-semibold">{t('security.actions')}</h3>
        <SecurityAction description={t('security.repairDescription')}>
          <Button
            className="shrink-0"
            variant="secondary"
            onPress={() => setPairAgainOpen(true)}
            data-cy="attractap-security-repair"
          >
            {t('security.repair')}
          </Button>
        </SecurityAction>
        <SecurityAction description={t('security.revokeDescription')}>
          <ConfirmableButton
            label={t('security.revoke')}
            status="error"
            buttonProps={{ className: 'shrink-0' }}
            data-cy="attractap-security-revoke"
            confirm={{
              title: t('security.revokeTitle'),
              message: t('security.revokeMessage'),
              cancelLabel: t('dialog.cancel'),
              confirmDataCy: 'attractap-security-revoke-confirm',
              'data-cy': 'attractap-security-revoke-dialog',
            }}
            isPending={revoke.isPending}
            onConfirm={() => revoke.mutateAsync({ path: { readerId: reader.id } })}
          />
        </SecurityAction>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">{t('security.history')}</h3>
        {(history ?? []).map((event) => (
          <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Chip size="sm">{t(`security.event.${event.state}`)}</Chip>
            <div className="flex items-center gap-3">
              <EventActor actorId={event.actorId} />
              <span>{format(event.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>

      <PairingDialog
        isOpen={pairAgainOpen}
        presetTargetReaderId={reader.id}
        onClose={() => setPairAgainOpen(false)}
        onPaired={() => setPairAgainOpen(false)}
      />
    </div>
  );
}
