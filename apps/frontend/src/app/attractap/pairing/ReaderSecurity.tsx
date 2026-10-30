import { AlertDialog, Button, Chip, ModalBody, ModalFooter, ModalHeader, ModalHeading, Spinner } from '@heroui/react';
import { AttraccessUser, useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Attractap,
  AttractapCredentialEvent,
  useAttractapServiceGetPairings,
  useAttractapServiceGetReaderCredentialHistory,
  useAttractapServiceRevokeReader,
  useAttractapServiceGetReadersKey,
  useAttractapServiceGetReaderCredentialHistoryKey,
  UseAttractapServiceGetReaderByIdKeyFn,
  useUsersServiceGetOneUserById,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StandardModal } from '../../../components/standardModal';
import { useToastMessage } from '../../../components/toastProvider';
import { PairingDialog } from './PairingDialog';
import { PairingStateChip } from './PairingStateChip';
import { WaitingDeviceSummary } from './WaitingDeviceSummary';
import { apiErrorMessage, isPairingRunning, readerIdsWaitingToPair } from './pairingUtils';
import de from './de.json';
import en from './en.json';

type TakeOverMode = 'repair' | 'replace';

/** The user behind a credential event; events without a user were caused by the reader or the system. */
function EventActor(props: Readonly<{ actorId: number | null }>) {
  const { actorId } = props;
  const { data: user, isError } = useUsersServiceGetOneUserById({ id: actorId ?? 0 }, undefined, {
    enabled: actorId !== null,
  });
  if (actorId === null) return <span>-</span>;
  if (isError) return <span>#{actorId}</span>;
  if (!user) return <Spinner size="sm" />;
  return <AttraccessUser user={user} interactive={false} />;
}

/** One action with a sentence that says what it does, so the buttons make sense on first sight. */
function SecurityAction(
  props: Readonly<{ label: string; description: string; onPress: () => void; dataCy: string; danger?: boolean }>,
) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm text-default-500">{props.description}</p>
      <Button
        className="shrink-0"
        variant={props.danger ? 'danger' : 'secondary'}
        onPress={props.onPress}
        data-cy={props.dataCy}
      >
        {props.label}
      </Button>
    </div>
  );
}

/** The credential the reader uses now, or the latest one when the current key is not in the history. */
function currentPairedEvent(history: AttractapCredentialEvent[] | undefined, fingerprint: string | null) {
  const paired = (history ?? []).filter((event) => event.state === 'paired');
  const latestFirst = [...paired].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return latestFirst.find((event) => event.keyFingerprint === fingerprint) ?? latestFirst[0];
}

export function ReaderSecurity(props: Readonly<{ reader: Attractap }>) {
  const { reader } = props;
  const { t } = useTranslations({ de, en });
  const format = useDateTimeFormatter();
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [pairingId, setPairingId] = useState<string | null>(null);
  const [pairingMode, setPairingMode] = useState<TakeOverMode | null>(null);
  const [pickerMode, setPickerMode] = useState<TakeOverMode | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const { data: history } = useAttractapServiceGetReaderCredentialHistory({ readerId: reader.id });
  const { data: pairings } = useAttractapServiceGetPairings(undefined, {
    refetchInterval: pickerMode ? 1000 : false,
  });

  const showError = (titleKey: string) => (error: unknown) =>
    toast.error({ title: t(titleKey), description: apiErrorMessage(error) });

  const revoke = useAttractapServiceRevokeReader({
    onSuccess: () => {
      setRevokeOpen(false);
      toast.success({ title: t('security.revoked') });
      queryClient.invalidateQueries({ queryKey: [useAttractapServiceGetReadersKey] });
      queryClient.invalidateQueries({ queryKey: [useAttractapServiceGetReaderCredentialHistoryKey] });
      queryClient.invalidateQueries({ queryKey: UseAttractapServiceGetReaderByIdKeyFn({ readerId: reader.id }) });
    },
    onError: showError('security.revokeFailed'),
  });

  // After a page reload a running re-pair or replace of this reader would be orphaned; pick it up once.
  // First pairings of readers that still use their token continue from the reader list.
  const resumeChecked = useRef(false);
  useEffect(() => {
    if (resumeChecked.current || !pairings) return;
    resumeChecked.current = true;
    const running = pairings.find(
      (p) =>
        p.targetReaderId === reader.id && (p.mode === 'repair' || p.mode === 'replace') && isPairingRunning(p.state),
    );
    if (running?.mode === 'repair' || running?.mode === 'replace') {
      setPairingId(running.id);
      setPairingMode(running.mode);
    }
  }, [pairings, reader.id]);

  // A device waiting to pair can also take over this record (replace) or renew its key (re-pair).
  const candidates = useMemo(
    () => (pairings ?? []).filter((p) => p.boundReaderId === null && p.state === 'announced' && !p.mode),
    [pairings],
  );
  const openPicker = (mode: TakeOverMode) => {
    if (candidates.length === 0) {
      toast.warning({ title: t('security.noCandidate') });
      return;
    }
    setPickerMode(mode);
  };
  const startWith = (candidateId: string) => {
    setPairingId(candidateId);
    setPairingMode(pickerMode);
    setPickerMode(null);
  };

  const waitingToPair = readerIdsWaitingToPair(pairings).has(reader.id);
  const pairedEvent = currentPairedEvent(history, reader.credentialFingerprint);

  return (
    <div className="flex flex-col gap-4" data-cy="attractap-security">
      <p className="text-sm text-default-500">{t('security.immediateHint')}</p>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t('security.state')}</h3>
        <PairingStateChip state={reader.pairingState} waiting={waitingToPair} />
      </div>

      {reader.pairingState === 'unpaired' && <p className="text-sm text-default-500">{t('security.unpairedHint')}</p>}

      {reader.pairingState === 'paired' && (
        <dl className="grid grid-cols-2 items-center gap-1 text-sm">
          <dt>{t('security.fingerprint')}</dt>
          <dd className="font-mono">{reader.credentialFingerprint?.slice(0, 16)}</dd>
          <dt>{t('security.pairedAt')}</dt>
          <dd>{reader.pairedAt ? format(reader.pairedAt) : '-'}</dd>
          <dt>{t('security.pairedBy')}</dt>
          <dd data-cy="attractap-security-paired-by">
            <EventActor actorId={pairedEvent?.actorId ?? null} />
          </dd>
          <dt>{t('security.certificateExpiry')}</dt>
          <dd>{reader.certificateNotAfter ? format(reader.certificateNotAfter) : '-'}</dd>
        </dl>
      )}

      {reader.pairingState !== 'unpaired' && (
        <div className="flex flex-col gap-3">
          <h3 className="font-semibold">{t('security.actions')}</h3>
          <SecurityAction
            label={t('security.repair')}
            description={t('security.repairDescription')}
            onPress={() => openPicker('repair')}
            dataCy="attractap-security-repair"
          />
          <SecurityAction
            label={t('security.replace')}
            description={t('security.replaceDescription')}
            onPress={() => openPicker('replace')}
            dataCy="attractap-security-replace"
          />
          {reader.pairingState === 'paired' && (
            <SecurityAction
              label={t('security.revoke')}
              description={t('security.revokeDescription')}
              onPress={() => setRevokeOpen(true)}
              dataCy="attractap-security-revoke"
              danger
            />
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">{t('security.history')}</h3>
        {history?.length === 0 && <p className="text-sm text-default-500">{t('security.historyEmpty')}</p>}
        {(history ?? []).map((event) => (
          <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-2">
                <Chip size="sm">{t(`security.event.${event.state}`)}</Chip>
                <span className="font-mono">{event.keyFingerprint.slice(0, 16)}</span>
              </span>
              {event.certificateSerial && (
                <span className="font-mono text-xs text-default-500">
                  {t('security.certificateSerial', { serial: event.certificateSerial })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <EventActor actorId={event.actorId} />
              <span>{format(event.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>

      <PairingDialog
        pairingId={pairingId}
        autoStartMode={pairingMode ?? undefined}
        presetTargetReaderId={reader.id}
        onClose={() => {
          setPairingId(null);
          setPairingMode(null);
        }}
      />

      <StandardModal isOpen={pickerMode !== null} onOpenChange={(open) => !open && setPickerMode(null)} size="md">
        {({ close }) => (
          <>
            <ModalHeader>
              <ModalHeading>{pickerMode && t(`security.chooseDevice.title.${pickerMode}`)}</ModalHeading>
            </ModalHeader>
            <ModalBody className="flex flex-col gap-3" data-cy="attractap-security-device-picker">
              <p className="text-sm text-default-500">{t('security.chooseDevice.description')}</p>
              {candidates.length === 0 && <p>{t('security.noCandidate')}</p>}
              {candidates.map((candidate) => (
                <div key={candidate.id} className="flex items-center justify-between gap-2">
                  <WaitingDeviceSummary pairing={candidate} />
                  <Button
                    size="sm"
                    onPress={() => startWith(candidate.id)}
                    data-cy={`attractap-security-use-device-${candidate.id}`}
                  >
                    {t('security.chooseDevice.use')}
                  </Button>
                </div>
              ))}
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={close}>
                {t('dialog.cancel')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>

      <AlertDialog isOpen={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container size="sm">
            <AlertDialog.Dialog data-cy="attractap-security-revoke-dialog">
              {({ close }) => (
                <>
                  <AlertDialog.Header>
                    <AlertDialog.Icon status="danger" />
                    <AlertDialog.Heading>{t('security.revokeTitle')}</AlertDialog.Heading>
                  </AlertDialog.Header>
                  <AlertDialog.Body>
                    <p>{t('security.revokeMessage')}</p>
                  </AlertDialog.Body>
                  <AlertDialog.Footer>
                    <Button variant="tertiary" onPress={close}>
                      {t('dialog.cancel')}
                    </Button>
                    <Button
                      variant="danger"
                      isPending={revoke.isPending}
                      onPress={() => revoke.mutate({ readerId: reader.id })}
                      data-cy="attractap-security-revoke-confirm"
                    >
                      {t('security.revoke')}
                    </Button>
                  </AlertDialog.Footer>
                </>
              )}
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
