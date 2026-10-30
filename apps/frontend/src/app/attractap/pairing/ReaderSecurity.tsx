import { AlertDialog, Button, Chip, ModalBody, ModalFooter, ModalHeader, ModalHeading, Spinner } from '@heroui/react';
import { AttraccessUser, useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Attractap,
  AttractapCredentialEvent,
  useAttractapServiceGetPairings,
  useAttractapServiceGetReaderCredentialHistory,
  useAttractapServiceRequestReaderPairing,
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
import { apiErrorMessage, readerIdsWaitingToPair } from './pairingUtils';
import de from './de.json';
import en from './en.json';

const PAIRING_REQUEST_TIMEOUT_MS = 30_000;

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

  const [awaitingReader, setAwaitingReader] = useState(false);
  const [pairingId, setPairingId] = useState<string | null>(null);
  const [pairingMode, setPairingMode] = useState<'pair' | TakeOverMode | null>(null);
  const [pickerMode, setPickerMode] = useState<TakeOverMode | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const { data: history } = useAttractapServiceGetReaderCredentialHistory({ readerId: reader.id });
  const { data: pairings } = useAttractapServiceGetPairings(undefined, {
    refetchInterval: awaitingReader || pickerMode ? 1000 : false,
  });

  const showError = (titleKey: string) => (error: unknown) =>
    toast.error({ title: t(titleKey), description: apiErrorMessage(error) });

  const requestPairing = useAttractapServiceRequestReaderPairing({
    onSuccess: (result) => {
      if (result.requested) {
        setAwaitingReader(true);
        toast.success({ title: t('security.requested') });
      } else {
        toast.error({ title: t('security.notConnected') });
      }
    },
    onError: showError('security.requestFailed'),
  });
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

  // Give up waiting when the reader never opens a pairing connection.
  const onNoResponse = useRef(() => undefined as void);
  onNoResponse.current = () => {
    setAwaitingReader(false);
    toast.error({ title: t('security.noResponse') });
  };
  useEffect(() => {
    if (!awaitingReader) return;
    const timer = setTimeout(() => onNoResponse.current(), PAIRING_REQUEST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [awaitingReader]);

  // A reader that was asked to pair connects to the pairing endpoint; pick up its request.
  useEffect(() => {
    if (!awaitingReader) return;
    const found = pairings?.find((p) => p.boundReaderId === reader.id && !p.mode);
    if (found) {
      setAwaitingReader(false);
      setPairingId(found.id);
      setPairingMode('pair');
    }
  }, [awaitingReader, pairings, reader.id]);

  // After a page reload an already running pairing of this reader would be orphaned; pick it up once.
  const resumeChecked = useRef(false);
  useEffect(() => {
    if (resumeChecked.current || !pairings) return;
    resumeChecked.current = true;
    const running = pairings.find((p) => p.boundReaderId === reader.id && p.mode);
    if (running) {
      setPairingId(running.id);
      setPairingMode(running.mode === 'new' ? 'pair' : running.mode);
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

      <div className="flex flex-wrap gap-2">
        {reader.pairingState === 'unpaired' && (
          <Button
            isPending={requestPairing.isPending || awaitingReader}
            onPress={() => requestPairing.mutate({ readerId: reader.id })}
            data-cy="attractap-security-pair"
          >
            {t('security.pair')}
          </Button>
        )}
        {reader.pairingState !== 'unpaired' && (
          <>
            <Button variant="secondary" onPress={() => openPicker('repair')} data-cy="attractap-security-repair">
              {t('security.repair')}
            </Button>
            <Button variant="secondary" onPress={() => openPicker('replace')} data-cy="attractap-security-replace">
              {t('security.replace')}
            </Button>
          </>
        )}
        {reader.pairingState === 'paired' && (
          <Button variant="danger" onPress={() => setRevokeOpen(true)} data-cy="attractap-security-revoke">
            {t('security.revoke')}
          </Button>
        )}
      </div>

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
        presetTargetReaderId={pairingMode === 'pair' ? undefined : reader.id}
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
