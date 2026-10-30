import {
  Alert,
  AlertContent,
  AlertDescription,
  Button,
  Chip,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Spinner,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useAttractapServiceCancelPairing,
  useAttractapServiceConfirmPairing,
  useAttractapServiceGetPairing,
  useAttractapServiceGetReaderByIdKey,
  useAttractapServiceGetReaderCredentialHistoryKey,
  useAttractapServiceGetReaders,
  useAttractapServiceGetReadersKey,
  useAttractapServiceStartPairing,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { AlertStatusIcon } from '../../../components/AlertStatusIcon';
import { Select } from '../../../components/select';
import { StandardModal } from '../../../components/standardModal';
import { useToastMessage } from '../../../components/toastProvider';
import { useNow } from '../../../hooks/useNow';
import { apiErrorMessage, TERMINAL_PAIRING_STATES } from './pairingUtils';
import de from './de.json';
import en from './en.json';

type Mode = 'new' | 'pair' | 'repair' | 'replace';

interface Props {
  pairingId: string | null;
  /** When the reader is already bound to a record (token sign-in), pairing starts without a choice. */
  autoStartMode?: Mode;
  presetTargetReaderId?: number;
  onClose: () => void;
}

const POLL_INTERVAL_MS = 1000;
const KNOWN_COLOURS = new Set(Object.keys(en.dialog.colour));

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function PairingDialog(props: Readonly<Props>) {
  const { pairingId, onClose } = props;
  const { t } = useTranslations({ de, en });
  const toast = useToastMessage();
  const now = useNow();

  const { data: pairing, isError: pollingFailed } = useAttractapServiceGetPairing(
    { pairingId: pairingId ?? '' },
    undefined,
    {
      enabled: pairingId !== null,
      // Nothing changes any more once the pairing ended.
      refetchInterval: (query) =>
        query.state.data && TERMINAL_PAIRING_STATES.includes(query.state.data.state) ? false : POLL_INTERVAL_MS,
    },
  );
  const { data: readers } = useAttractapServiceGetReaders(undefined, { enabled: pairingId !== null });

  const [mode, setMode] = useState<Mode>('new');
  const [targetReaderId, setTargetReaderId] = useState<number | undefined>(props.presetTargetReaderId);

  const showError = (titleKey: string) => (error: unknown) =>
    toast.error({ title: t(titleKey), description: apiErrorMessage(error) });

  const start = useAttractapServiceStartPairing({ onError: showError('dialog.startFailed') });
  const confirm = useAttractapServiceConfirmPairing({ onError: showError('dialog.confirmFailed') });
  const cancel = useAttractapServiceCancelPairing({ onError: showError('dialog.cancelFailed') });

  // The dialog stays mounted between pairings; a new pairing starts with a fresh start attempt.
  const { reset: resetStart } = start;
  useEffect(() => resetStart(), [pairingId, resetStart]);

  const autoStarted = pairing?.mode !== null && pairing?.mode !== undefined;
  useEffect(() => {
    // A failed start stays failed until the admin retries; it must not loop.
    if (!pairingId || !props.autoStartMode || !pairing || autoStarted || !start.isIdle) return;
    start.mutate({ pairingId, requestBody: { mode: props.autoStartMode, targetReaderId: props.presetTargetReaderId } });
  }, [pairingId, props.autoStartMode, props.presetTargetReaderId, pairing, autoStarted, start]);

  const queryClient = useQueryClient();
  useEffect(() => {
    if (pairing?.state !== 'completed') return;
    // The reader is paired now: refresh the list, the editor and the credential history.
    for (const key of [
      useAttractapServiceGetReadersKey,
      useAttractapServiceGetReaderByIdKey,
      useAttractapServiceGetReaderCredentialHistoryKey,
    ]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  }, [pairing?.state, queryClient]);

  const insecure = typeof window !== 'undefined' && !window.isSecureContext;
  const state = pairing?.state;
  const finished = state !== undefined && TERMINAL_PAIRING_STATES.includes(state);

  const readerOptions = useMemo(
    () => (readers ?? []).map((reader) => ({ key: reader.id.toString(), label: reader.name })),
    [readers],
  );

  const remaining = pairing?.expiresAt ? new Date(pairing.expiresAt).getTime() - now.getTime() : null;

  const code = pairing?.code;
  const needsChoice = pairing !== undefined && !autoStarted && !props.autoStartMode;
  const canStart = mode === 'new' || targetReaderId !== undefined;
  const waitingForReader = !finished && !code && !needsChoice && !start.isError && !pollingFailed;

  const colourName = (colour: string) => (KNOWN_COLOURS.has(colour) ? t(`dialog.colour.${colour}`) : colour);

  return (
    <StandardModal isOpen={pairingId !== null} onOpenChange={(open) => !open && onClose()} size="md">
      {() => (
        <>
          <ModalHeader>
            <ModalHeading>{t('dialog.title')}</ModalHeading>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-4" data-cy="attractap-pairing-dialog">
            {insecure && (
              <Alert status="warning" data-cy="attractap-pairing-insecure-warning">
                <AlertStatusIcon status="warning" />
                <AlertContent>
                  <AlertDescription>{t('dialog.insecureWarning')}</AlertDescription>
                </AlertContent>
              </Alert>
            )}

            {pollingFailed && (
              <Alert status="danger" data-cy="attractap-pairing-connection-lost">
                <AlertStatusIcon status="danger" />
                <AlertContent>
                  <AlertDescription>{t('dialog.connectionLost')}</AlertDescription>
                </AlertContent>
              </Alert>
            )}

            {start.isError && (
              <Alert status="danger" data-cy="attractap-pairing-start-error">
                <AlertStatusIcon status="danger" />
                <AlertContent>
                  <AlertDescription>
                    {t('dialog.startFailed')}: {apiErrorMessage(start.error)}
                  </AlertDescription>
                </AlertContent>
              </Alert>
            )}

            {needsChoice && !finished && (
              <div className="flex flex-col gap-3">
                <p>{t('dialog.chooseMode')}</p>
                <Select
                  items={(['new', 'repair', 'replace'] as const).map((m) => ({ key: m, label: t(`dialog.mode.${m}`) }))}
                  aria-label={t('dialog.chooseMode')}
                  value={mode}
                  onChange={(key) => setMode(key as Mode)}
                />
                {mode !== 'new' && (
                  <Select
                    items={readerOptions}
                    label={t('dialog.targetReader')}
                    value={targetReaderId?.toString() ?? ''}
                    onChange={(key) => setTargetReaderId(Number(key))}
                  />
                )}
              </div>
            )}

            {waitingForReader && (
              <div className="flex items-center justify-center gap-3" data-cy="attractap-pairing-waiting">
                <Spinner size="sm" />
                <span>{t('dialog.waitingForReader')}</span>
              </div>
            )}

            {code && !finished && (
              <div className="flex flex-col items-center gap-3" data-cy="attractap-pairing-code">
                <p>{t('dialog.compare')}</p>
                {code.kind === 'digits' ? (
                  <span className="text-4xl font-mono tracking-widest">
                    {String(code.value).slice(0, 3)} {String(code.value).slice(3)}
                  </span>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex gap-2" aria-hidden="true">
                      {(code.value as string[]).map((colour, index) => (
                        <span key={`${index}-${colour}`} className="flex flex-col items-center gap-1 text-xs">
                          <span
                            className="size-8 rounded-full border border-default-300"
                            style={{ backgroundColor: colour }}
                          />
                          {index + 1}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm" data-cy="attractap-pairing-colour-names">
                      {(code.value as string[])
                        .map((colour, index) =>
                          t('dialog.colourItem', { index: index + 1, colour: colourName(colour) }),
                        )
                        .join(', ')}
                    </p>
                    <p className="text-sm text-default-500">{t('dialog.colourHint')}</p>
                  </div>
                )}
                {remaining !== null && (
                  <p className="text-sm text-default-500" role="timer">
                    {t('dialog.timeLeft', { time: formatRemaining(remaining) })}
                  </p>
                )}
              </div>
            )}

            <div aria-live="polite" className="flex flex-col items-center gap-2">
              {code && !finished && (
                <div className="flex flex-wrap justify-center gap-2">
                  <Chip color={pairing?.adminConfirmed ? 'success' : 'default'}>
                    {pairing?.adminConfirmed ? t('dialog.adminDone') : t('dialog.adminWaiting')}
                  </Chip>
                  <Chip color={pairing?.readerConfirmed ? 'success' : 'default'}>
                    {pairing?.readerConfirmed ? t('dialog.readerDone') : t('dialog.readerWaiting')}
                  </Chip>
                </div>
              )}
              {finished && (
                <div className="flex flex-col gap-1" data-cy="attractap-pairing-result">
                  <p>{t(`dialog.${state}`)}</p>
                  {pairing?.failureReason && (
                    <p className="text-sm text-default-500" data-cy="attractap-pairing-failure-reason">
                      {t(`dialog.reason.${pairing.failureReason}`)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            {finished ? (
              <Button onPress={onClose}>{t('dialog.close')}</Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onPress={() => {
                    if (pairingId) cancel.mutate({ pairingId });
                    onClose();
                  }}
                >
                  {t('dialog.cancel')}
                </Button>
                {props.autoStartMode && start.isError && (
                  <Button onPress={() => start.reset()} data-cy="attractap-pairing-retry">
                    {t('dialog.retry')}
                  </Button>
                )}
                {needsChoice && (
                  <Button
                    isDisabled={!canStart}
                    isPending={start.isPending}
                    onPress={() => pairingId && start.mutate({ pairingId, requestBody: { mode, targetReaderId } })}
                  >
                    {t('dialog.start')}
                  </Button>
                )}
                {code && (
                  <Button
                    isDisabled={pairing?.adminConfirmed}
                    isPending={confirm.isPending}
                    onPress={() => pairingId && confirm.mutate({ pairingId })}
                    data-cy="attractap-pairing-confirm"
                  >
                    {t('dialog.confirm')}
                  </Button>
                )}
              </>
            )}
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
