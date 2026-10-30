import {
  Alert,
  AlertContent,
  AlertDescription,
  Button,
  ColorSwatch,
  Input,
  Label,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Spinner,
  TextField,
} from '@heroui/react';
import { CameraIcon } from 'lucide-react';
import { AlertStatusIcon, StandardModal, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  PairingDto,
  useAttractapServiceApprovePairing,
  useAttractapServiceGetPairing,
  useAttractapServiceGetPairings,
  useAttractapServiceGetPairingsKey,
  useAttractapServiceGetReaderByIdKey,
  useAttractapServiceGetReaderCredentialHistoryKey,
  useAttractapServiceGetReaders,
  useAttractapServiceGetReadersKey,
  useAttractapServiceResolvePairing,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Select } from '../../../components/select';
import { useToastMessage } from '../../../components/toastProvider';
import { ResourceScanner } from '../../resourceOverview/toolbar/scanner';
import { enrollmentCodeFromScan, formatEnrollmentCode, normalizeEnrollmentCode } from './enrollmentCode';
import { classifyPairingError, isPairingRunning, PairingError, TERMINAL_PAIRING_STATES } from './pairingUtils';
import de from './de.json';
import en from './en.json';

type LedColour = 'red' | 'green' | 'blue' | 'yellow' | 'white' | 'magenta';
type Choice = 'new' | 'takeover';

export interface PairingDialogProps {
  isOpen: boolean;
  /** A request that is already known, for example the one a reader sent after its Pair button was pressed. */
  pairingId?: string;
  /** Waits for this token reader to start pairing (after its Pair button was pressed), then continues with it. */
  waitForReaderId?: number;
  /** Code that is filled in already (link or web flasher). */
  presetCode?: string;
  via?: 'flasher';
  /** The record a reader takes over (Pair again, or a reader whose pairing was removed). */
  presetTargetReaderId?: number;
  onClose: () => void;
  /** Called once with the paired reader, after the lists were refreshed. The caller closes the dialog. */
  onPaired?: (readerId: number) => void;
}

const POLL_INTERVAL_MS = 1000;
const NO_RESPONSE_TIMEOUT_MS = 30_000;
const NAME_MAX_LENGTH = 64;
// Close to what the WS2812 ring shows (yellow is the firmware's 255/200/0), so swatch and ring look alike.
const SWATCH: Record<LedColour, string> = {
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffc800',
  white: '#ffffff',
  magenta: '#ff00ff',
};

/** One row in ring order: segment 8 sits next to segment 1, so any other layout could be misread. */
function PatternSwatches(props: Readonly<{ pattern: LedColour[]; colourName: (colour: string) => string }>) {
  const { t } = useTranslations({ de, en });
  return (
    <ol className="flex flex-row flex-wrap justify-center gap-3" data-cy="attractap-pairing-pattern">
      {props.pattern.map((colour, index) => (
        <li key={`${index}-${colour}`} className="flex flex-col items-center gap-1 text-xs">
          <span aria-hidden="true">
            <ColorSwatch color={SWATCH[colour]} size="sm" />
          </span>
          <span className="font-semibold">{index === 0 ? t('dialog.segmentStart', { index: 1 }) : index + 1}</span>
          <span>{props.colourName(colour)}</span>
        </li>
      ))}
    </ol>
  );
}

function errorText(t: (key: string, vars?: Record<string, unknown>) => string, error: PairingError) {
  switch (error.kind) {
    case 'rateLimited':
      return error.retryAfterSeconds === undefined
        ? t('dialog.error.rateLimited')
        : t('dialog.error.rateLimitedRetry', { seconds: error.retryAfterSeconds });
    case 'unknown':
      return error.message ? `${t('dialog.error.unknown')}: ${error.message}` : t('dialog.error.unknown');
    default:
      return t(`dialog.error.${error.kind}`);
  }
}

/**
 * The one place a reader is approved: the admin identifies the reader (code or colour pattern), says what
 * it is, and approves. The state of the request is read from the server, never assumed.
 */
export function PairingDialog(props: Readonly<PairingDialogProps>) {
  const { isOpen, onClose } = props;
  return (
    <StandardModal isOpen={isOpen} onOpenChange={(open) => !open && onClose()} size="md">
      {() => <PairingDialogContent {...props} />}
    </StandardModal>
  );
}

function PairingDialogContent(props: Readonly<PairingDialogProps>) {
  const { onClose } = props;
  const { t } = useTranslations({ de, en });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [codeInput, setCodeInput] = useState(props.presetCode ?? '');
  const [resolved, setResolved] = useState<PairingDto | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice>('new');
  const [pickedTarget, setPickedTarget] = useState<number | undefined>(undefined);
  const [name, setName] = useState('');
  const [error, setError] = useState<PairingError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noResponse, setNoResponse] = useState(false);
  // Ring pattern the admin has in front of them; approving sends this round only if it is still the current one.
  const shownRound = useRef<number | null>(null);
  // isPending only flips after the next render, so a double click would send the request twice.
  const submitting = useRef(false);

  const waitForReaderId = props.waitForReaderId;
  const { data: allPairings } = useAttractapServiceGetPairings(undefined, {
    refetchInterval: POLL_INTERVAL_MS,
  });
  const running = useMemo(() => (allPairings ?? []).filter((p) => isPairingRunning(p.state)), [allPairings]);
  const arrived = waitForReaderId === undefined ? undefined : running.find((p) => p.boundReaderId === waitForReaderId);

  // A reader that was asked to pair but never connects is off or runs software that cannot pair yet.
  useEffect(() => {
    if (waitForReaderId === undefined || props.pairingId || arrived) return;
    const timer = setTimeout(() => setNoResponse(true), NO_RESPONSE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [waitForReaderId, props.pairingId, arrived]);

  const activeId = props.pairingId ?? arrived?.id ?? pickedId ?? resolved?.id ?? null;
  const {
    data: pairing,
    isError: pollingFailed,
    refetch,
  } = useAttractapServiceGetPairing({ pairingId: activeId ?? '' }, undefined, {
    enabled: activeId !== null,
    // Nothing changes any more once the pairing ended.
    refetchInterval: (query) =>
      query.state.data && TERMINAL_PAIRING_STATES.includes(query.state.data.state) ? false : POLL_INTERVAL_MS,
  });
  const current = pairing ?? (activeId === resolved?.id ? resolved : null);

  const { data: readers } = useAttractapServiceGetReaders();
  const readerOptions = useMemo(
    // Only readers that were paired before can be taken over.
    () =>
      (readers ?? [])
        .filter((reader) => reader.pairingState !== 'unpaired')
        .map((reader) => ({ key: reader.id.toString(), label: reader.name })),
    [readers],
  );

  const resolvedByCode = activeId !== null && activeId === resolved?.id;
  const bound = current?.boundReaderId != null;
  const targetReaderId = props.presetTargetReaderId ?? pickedTarget;
  const mode: 'new' | 'pair' | 'takeover' = bound
    ? 'pair'
    : props.presetTargetReaderId || choice === 'takeover'
      ? 'takeover'
      : 'new';
  const normalizedCode = normalizeEnrollmentCode(codeInput);
  const isLite = current?.kind === 'lite';
  // A Lite reader that was not found by its code is compared by its colour pattern.
  const byPattern = isLite && !resolvedByCode;
  const finished = current !== null && TERMINAL_PAIRING_STATES.includes(current.state);
  const insecure = typeof window !== 'undefined' && !window.isSecureContext;
  const targetName = readers?.find((reader) => reader.id === props.presetTargetReaderId)?.name;

  const colourName = (colour: string) => (colour in en.dialog.colour ? t(`dialog.colour.${colour}`) : colour);

  const refreshLists = () =>
    Promise.all(
      [
        useAttractapServiceGetReadersKey,
        useAttractapServiceGetReaderByIdKey,
        useAttractapServiceGetReaderCredentialHistoryKey,
        useAttractapServiceGetPairingsKey,
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );

  const resolve = useAttractapServiceResolvePairing({
    onSuccess: (found) => {
      setResolved(found);
      setError(null);
    },
    onError: (failure) => setError(classifyPairingError(failure, true)),
  });

  const approve = useAttractapServiceApprovePairing({
    onSuccess: async (done) => {
      await refreshLists();
      submitting.current = false;
      const readerId = done.targetReaderId ?? done.boundReaderId;
      toast.success({ title: t('dialog.paired'), duration: 2500 });
      if (readerId !== null) props.onPaired?.(readerId);
      else onClose();
    },
    onError: (failure) => {
      submitting.current = false;
      const classified = classifyPairingError(failure);
      setError(classified);
      // The pattern moved on, or the request is over: show what the reader shows now.
      if (classified.kind === 'stale' || classified.kind === 'notWaiting') void refetch();
    },
  });

  const idle = !resolve.isPending && !approve.isPending;

  const findByCode = () => {
    if (!normalizedCode || !idle) return;
    setError(null);
    resolve.mutate({ requestBody: { code: normalizedCode } });
  };

  // `?enroll=CODE` and the web flasher arrive with the code: look the reader up right away.
  const autoResolved = useRef(false);
  useEffect(() => {
    if (autoResolved.current || !props.presetCode || props.pairingId || !normalizedCode) return;
    autoResolved.current = true;
    resolve.mutate({ requestBody: { code: normalizedCode } });
  }, [props.presetCode, props.pairingId, normalizedCode, resolve]);

  const readyForMode = mode !== 'takeover' || targetReaderId !== undefined;
  const canApprove =
    current !== null &&
    !finished &&
    readyForMode &&
    idle &&
    (byPattern ? current.round != null && current.pattern != null : normalizedCode !== null);

  const submit = async () => {
    if (!current || !canApprove || submitting.current) return;
    submitting.current = true;
    setError(null);
    setNotice(null);
    const base = {
      mode,
      ...(mode === 'takeover' ? { targetReaderId } : {}),
      ...(mode === 'new' && name.trim() ? { name: name.trim() } : {}),
      ...(props.via ? { via: props.via } : {}),
    };
    if (byPattern) {
      // Read again right before approving: a pattern that rotated while the admin was comparing must be
      // looked at again, never approved from an old screen.
      const fresh = (await refetch()).data;
      if (!fresh || fresh.round == null || fresh.round !== shownRound.current) {
        submitting.current = false;
        setNotice(t('dialog.patternChanged'));
        return;
      }
      approve.mutate({ pairingId: current.id, requestBody: { ...base, round: fresh.round } });
      return;
    }
    approve.mutate({ pairingId: current.id, requestBody: { ...base, code: normalizedCode ?? undefined } });
  };

  // The round on screen. Set while rendering the pattern, so it always matches what the admin can see.
  shownRound.current = byPattern ? (current?.round ?? null) : null;

  const waitingForReader = waitForReaderId !== undefined && !activeId && !noResponse;
  const needsCodeToFind = !activeId && !waitingForReader && !noResponse;
  const waitingLite = props.presetTargetReaderId
    ? running.filter((p) => p.kind === 'lite' && p.boundReaderId === null && !p.mode)
    : [];
  const needsChoice = current !== null && !finished && !bound && props.presetTargetReaderId === undefined;

  const codeField = (
    <div className="flex items-end gap-2">
      <TextField
        className="grow"
        value={codeInput}
        onChange={(value) => {
          setCodeInput(value.toUpperCase());
          setError(null);
        }}
        isDisabled={!idle}
      >
        <Label>{t('dialog.codeLabel')}</Label>
        <Input
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={16}
          placeholder="K7P-3XQ"
          className="font-mono tracking-widest"
          data-cy="attractap-pairing-code-input"
        />
      </TextField>
      {!insecure && (
        <ResourceScanner
          title={t('dialog.scanTitle')}
          onDetected={(raw) => {
            const scanned = enrollmentCodeFromScan(raw);
            if (!scanned) return false;
            setCodeInput(formatEnrollmentCode(scanned));
            setError(null);
            return true;
          }}
        >
          {(open) => (
            <Button variant="secondary" onPress={open} data-cy="attractap-pairing-scan">
              <CameraIcon className="size-4" />
              {t('dialog.scan')}
            </Button>
          )}
        </ResourceScanner>
      )}
    </div>
  );

  return (
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

        {waitingForReader && (
          <div className="flex items-center justify-center gap-3" data-cy="attractap-pairing-waiting">
            <Spinner size="sm" />
            <span>{t('dialog.waitingForReader')}</span>
          </div>
        )}

        {noResponse && !activeId && (
          <Alert status="danger" data-cy="attractap-pairing-no-response">
            <AlertStatusIcon status="danger" />
            <AlertContent>
              <AlertDescription>{t('dialog.noResponse')}</AlertDescription>
            </AlertContent>
          </Alert>
        )}

        {needsCodeToFind && (
          <div className="flex flex-col gap-3">
            {props.presetTargetReaderId !== undefined && targetName && (
              <p>{t('dialog.takesOver', { name: targetName })}</p>
            )}
            <p className="text-sm text-default-500">{t('dialog.findHint')}</p>
            {codeField}
            {waitingLite.length > 0 && (
              <div className="flex flex-col gap-2" data-cy="attractap-pairing-lite-list">
                <p className="text-sm text-default-500">{t('dialog.liteHint')}</p>
                {waitingLite.map((p) => (
                  <Button
                    key={p.id}
                    variant="secondary"
                    onPress={() => setPickedId(p.id)}
                    data-cy={`attractap-pairing-pick-${p.id}`}
                  >
                    {t('dialog.pickLite')}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {current && !finished && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-default-500">
              {t(`kind.${current.kind}`)}
              {current.firmware?.version ? ` · v${current.firmware.version}` : ''}
            </p>

            {needsChoice && (
              <div className="flex flex-col gap-3">
                <p>{t('dialog.chooseMode')}</p>
                <Select
                  items={(['new', 'takeover'] as const).map((m) => ({ key: m, label: t(`dialog.mode.${m}`) }))}
                  aria-label={t('dialog.chooseMode')}
                  value={choice}
                  onChange={(key) => setChoice(key as Choice)}
                />
                {choice === 'new' ? (
                  <TextField value={name} onChange={setName} isDisabled={!idle}>
                    <Label>{t('dialog.nameLabel')}</Label>
                    <Input autoComplete="off" maxLength={NAME_MAX_LENGTH} data-cy="attractap-pairing-name" />
                  </TextField>
                ) : (
                  <Select
                    items={readerOptions}
                    label={t('dialog.targetReader')}
                    value={pickedTarget?.toString() ?? ''}
                    onChange={(key) => setPickedTarget(Number(key))}
                  />
                )}
              </div>
            )}

            {byPattern ? (
              <div className="flex flex-col items-center gap-3" data-cy="attractap-pairing-lite">
                <p>{t('dialog.comparePattern')}</p>
                {current.pattern ? (
                  <PatternSwatches pattern={current.pattern as LedColour[]} colourName={colourName} />
                ) : (
                  <Spinner size="sm" />
                )}
                <p className="text-sm text-default-500">{t('dialog.patternHint')}</p>
              </div>
            ) : resolvedByCode ? (
              <p data-cy="attractap-pairing-code-chosen">
                {t('dialog.codeFound', { code: normalizedCode ? formatEnrollmentCode(normalizedCode) : '' })}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-default-500">{t('dialog.typeCode')}</p>
                {codeField}
              </div>
            )}
          </div>
        )}

        {notice && (
          <Alert status="warning" data-cy="attractap-pairing-notice">
            <AlertStatusIcon status="warning" />
            <AlertContent>
              <AlertDescription>{notice}</AlertDescription>
            </AlertContent>
          </Alert>
        )}

        {error && (
          <Alert status="danger" data-cy="attractap-pairing-error">
            <AlertStatusIcon status="danger" />
            <AlertContent>
              <AlertDescription>{errorText(t, error)}</AlertDescription>
            </AlertContent>
          </Alert>
        )}

        {finished && current && (
          <div className="flex flex-col gap-1" data-cy="attractap-pairing-result">
            <p>{t(`dialog.${current.state}`)}</p>
            {current.failureReason && (
              <p className="text-sm text-default-500" data-cy="attractap-pairing-failure-reason">
                {t(`dialog.reason.${current.failureReason}`)}
              </p>
            )}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        {finished || noResponse ? (
          <Button onPress={onClose}>{t('dialog.close')}</Button>
        ) : (
          <>
            <Button variant="ghost" onPress={onClose}>
              {t('dialog.cancel')}
            </Button>
            {needsCodeToFind && (
              <Button
                isDisabled={!normalizedCode}
                isPending={resolve.isPending}
                onPress={findByCode}
                data-cy="attractap-pairing-find"
              >
                {t('dialog.find')}
              </Button>
            )}
            {current && (
              <Button
                isDisabled={!canApprove}
                isPending={approve.isPending}
                onPress={submit}
                data-cy="attractap-pairing-approve"
              >
                {t('dialog.approve')}
              </Button>
            )}
          </>
        )}
      </ModalFooter>
    </>
  );
}
