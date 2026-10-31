import {
  PairingDto,
  useAttractapServiceApprovePairing,
  useAttractapServiceCancelPairing,
  useAttractapServiceGetPairing,
  useAttractapServiceGetPairings,
  useAttractapServiceGetPairingsKey,
  useAttractapServiceGetReaderByIdKey,
  useAttractapServiceGetReaderCredentialHistoryKey,
  useAttractapServiceGetReaders,
  useAttractapServiceGetReadersKey,
  useAttractapServiceResolvePairing,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { normalizeEnrollmentCode } from './enrollmentCode';
import { classifyPairingError, isPairingRunning, PairingError, TERMINAL_PAIRING_STATES } from './pairingUtils';
import de from './de.json';
import en from './en.json';

export type Choice = 'new' | 'takeover';
type Mode = 'new' | 'pair' | 'takeover';

export interface PairingFlowProps {
  pairingId?: string;
  waitForReaderId?: number;
  presetCode?: string;
  via?: 'flasher';
  presetTargetReaderId?: number;
  onClose: () => void;
  onPaired?: (readerId: number) => void;
}

const POLL_INTERVAL_MS = 1000;
const NO_RESPONSE_TIMEOUT_MS = 30_000;
const COUNTDOWN_TICK_MS = 250;
// After these the request moved on or ended: read it again so the dialog shows what the reader shows.
const REREAD_ERRORS: ReadonlySet<string> = new Set(['stale', 'notWaiting', 'failed', 'readerGone']);
// The request is over; once the dialog shows how it ended, the error would only repeat it.
const ENDED_ERRORS: ReadonlySet<string> = new Set(['notWaiting', 'failed', 'readerGone']);

export const isFinished = (pairing: PairingDto | null) =>
  pairing !== null && TERMINAL_PAIRING_STATES.includes(pairing.state);

/** What the reader is: its own record (token), a takeover of a chosen record, or a new record. */
export function modeOf(bound: boolean, hasPresetTarget: boolean, choice: Choice): Mode {
  if (bound) return 'pair';
  return hasPresetTarget || choice === 'takeover' ? 'takeover' : 'new';
}

interface BodyInput {
  mode: Mode;
  targetReaderId?: number;
  name: string;
  via?: 'flasher';
}

/** The parts of the approval that do not depend on how the admin proved the reader. */
export function approvalBase({ mode, targetReaderId, name, via }: BodyInput) {
  const trimmed = name.trim();
  return {
    mode,
    ...(mode === 'takeover' ? { targetReaderId } : {}),
    ...(mode === 'new' && trimmed ? { name: trimmed } : {}),
    ...(via ? { via } : {}),
  };
}

/**
 * The request a token reader sends after it was asked to pair. Once seen it is kept, so the dialog can
 * show how it ended (the list of pairings only holds running ones).
 */
function useArrivedPairing(props: PairingFlowProps, running: PairingDto[]) {
  const { waitForReaderId, pairingId } = props;
  const arrived = running.find((p) => waitForReaderId !== undefined && p.boundReaderId === waitForReaderId)?.id;
  const [seenId, setSeenId] = useState<string | null>(null);
  const [noResponse, setNoResponse] = useState(false);

  useEffect(() => {
    if (!arrived) return;
    setSeenId(arrived);
    // A reader that answers late can still be approved.
    setNoResponse(false);
  }, [arrived]);

  // A reader that was asked to pair but never connects is off or runs software that cannot pair yet.
  const waiting = waitForReaderId !== undefined && !pairingId && !arrived && !seenId;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setNoResponse(true), NO_RESPONSE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  return { arrivedId: arrived ?? seenId, noResponse };
}

/** Finds the request the dialog works on: given, announced by a token reader, picked, or found by code. */
function useActivePairing(props: PairingFlowProps, resolved: PairingDto | null, pickedId: string | null) {
  const { data: allPairings } = useAttractapServiceGetPairings(undefined, { refetchInterval: POLL_INTERVAL_MS });
  const running = useMemo(() => (allPairings ?? []).filter((p) => isPairingRunning(p.state)), [allPairings]);
  const { arrivedId, noResponse } = useArrivedPairing(props, running);

  const activeId = props.pairingId ?? arrivedId ?? pickedId ?? resolved?.id ?? null;
  const query = useAttractapServiceGetPairing({ pairingId: activeId ?? '' }, undefined, {
    enabled: activeId !== null,
    // Nothing changes any more once the pairing ended.
    refetchInterval: (q) => (isFinished(q.state.data ?? null) ? false : POLL_INTERVAL_MS),
  });
  const resolvedByCode = activeId !== null && activeId === resolved?.id;
  const current = query.data ?? (resolvedByCode ? resolved : null);
  return {
    running,
    activeId,
    current,
    resolvedByCode,
    noResponse,
    pollingFailed: query.isError,
    refetch: query.refetch,
  };
}

/**
 * The code the admin proves the reader with: typed, scanned, or handed over by a link or the web flasher.
 * The web flasher reads the code again on every rotation; the dialog follows it until the admin types one.
 */
function useCodeInput(presetCode: string | undefined) {
  const [codeInput, setCodeInput] = useState(presetCode ?? '');
  const [ownCode, setOwnCode] = useState(false);
  // The server said the code does not match: the code field is shown again, even for a code found before.
  const [codeRejected, setCodeRejected] = useState(false);

  useEffect(() => {
    if (presetCode && !ownCode) setCodeInput(presetCode);
  }, [presetCode, ownCode]);

  return {
    codeInput,
    codeRejected,
    setOwnCode: (value: string) => {
      setOwnCode(true);
      setCodeInput(value);
    },
    /** Keeps a code the admin typed so they can correct it; a handed-over code is replaced by a newer one. */
    reject: (sent: string | null) => {
      setCodeRejected(true);
      if (ownCode) return;
      const newer = presetCode && normalizeEnrollmentCode(presetCode) !== sent ? presetCode : '';
      setCodeInput(newer);
    },
  };
}

/** Counts down the wait the server asked for after too many attempts. */
export function useRetryCountdown() {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === null) return;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= deadline) setDeadline(null);
    }, COUNTDOWN_TICK_MS);
    return () => clearInterval(timer);
  }, [deadline]);

  return {
    secondsLeft: deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000)),
    start: (seconds: number) => {
      const time = Date.now();
      setNow(time);
      setDeadline(time + seconds * 1000);
    },
  };
}

/** The error to show: a rate limit counts down live and disappears when it is over; an ended request explains itself. */
function visibleError(error: PairingError | null, secondsLeft: number, finished: boolean): PairingError | null {
  if (!error) return null;
  if (error.kind === 'rateLimited' && error.retryAfterSeconds !== undefined) {
    return secondsLeft > 0 ? { ...error, retryAfterSeconds: secondsLeft } : null;
  }
  return finished && ENDED_ERRORS.has(error.kind) ? null : error;
}

/**
 * Cancel ends the reader's waiting request on the server, so nobody can approve it once the dialog is
 * gone; the reader then starts over with a new code. An approval already on its way is left alone.
 */
function useCancelAndClose(
  current: PairingDto | null,
  approving: () => boolean,
  onClose: () => void,
  refresh: () => unknown,
) {
  const cancelPairing = useAttractapServiceCancelPairing({ onSettled: () => void refresh() });
  return () => {
    if (current && isPairingRunning(current.state) && !approving()) cancelPairing.mutate({ pairingId: current.id });
    onClose();
  };
}

export function usePairingFlow(props: PairingFlowProps) {
  const { onClose } = props;
  const { t } = useTranslations({ de, en });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const code = useCodeInput(props.presetCode);
  const { codeInput } = code;
  const [resolved, setResolved] = useState<PairingDto | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice>('new');
  const [pickedTarget, setPickedTarget] = useState<number | undefined>(undefined);
  const [name, setName] = useState('');
  const [error, setError] = useState<PairingError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const countdown = useRetryCountdown();
  // Ring pattern the admin has in front of them; approving sends this round only if it is still the current one.
  const shownRound = useRef<number | null>(null);
  // isPending only flips after the next render, so a double click or Enter would send the request twice.
  const submitting = useRef(false);
  const sentCode = useRef<string | null>(null);

  const active = useActivePairing(props, resolved, pickedId);
  const { current, resolvedByCode, refetch } = active;
  const { data: readers } = useAttractapServiceGetReaders();

  const refreshLists = () =>
    Promise.all(
      [
        useAttractapServiceGetReadersKey,
        useAttractapServiceGetReaderByIdKey,
        useAttractapServiceGetReaderCredentialHistoryKey,
        useAttractapServiceGetPairingsKey,
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );

  const failed = (classified: PairingError) => {
    submitting.current = false;
    setError(classified);
    if (classified.retryAfterSeconds) countdown.start(classified.retryAfterSeconds);
  };

  const resolve = useAttractapServiceResolvePairing({
    onSuccess: (found) => {
      submitting.current = false;
      setResolved(found);
      setError(null);
    },
    onError: (failure) => failed(classifyPairingError(failure, true)),
  });

  const approve = useAttractapServiceApprovePairing({
    onSuccess: async (done) => {
      await refreshLists();
      submitting.current = false;
      // A preset target means the record was paired before: it is paired again.
      const title = props.presetTargetReaderId === undefined ? 'dialog.paired' : 'security.pairedAgain';
      toast.success({ title: t(title), duration: 2500 });
      const readerId = done.targetReaderId ?? done.boundReaderId;
      if (readerId === null) onClose();
      else props.onPaired?.(readerId);
    },
    onError: (failure) => {
      const classified = classifyPairingError(failure);
      failed(classified);
      if (classified.kind === 'wrongCode') code.reject(sentCode.current);
      if (REREAD_ERRORS.has(classified.kind)) void refetch();
    },
  });

  const idle = !resolve.isPending && !approve.isPending;
  const cancelAndClose = useCancelAndClose(current, () => approve.isPending || submitting.current, onClose, refreshLists);
  const blocked = countdown.secondsLeft > 0;
  const normalizedCode = normalizeEnrollmentCode(codeInput);
  const bound = current?.boundReaderId != null;
  const mode = modeOf(bound, !!props.presetTargetReaderId, choice);
  const targetReaderId = props.presetTargetReaderId ?? pickedTarget;
  // A Lite reader that was not found by its code is compared by its colour pattern.
  const byPattern = current?.kind === 'lite' && !resolvedByCode;
  const finished = isFinished(current);
  const canFind = normalizedCode !== null && idle && !blocked;

  const findByCode = () => {
    if (!canFind || submitting.current) return;
    submitting.current = true;
    setError(null);
    resolve.mutate({ requestBody: { code: normalizedCode } });
  };

  // `?enroll=CODE` and the web flasher arrive with the code: look the reader up right away.
  const autoResolved = useRef(false);
  const { presetCode, pairingId } = props;
  const { mutate: resolveMutate } = resolve;
  useEffect(() => {
    if (autoResolved.current || !presetCode || pairingId || !normalizedCode) return;
    autoResolved.current = true;
    resolveMutate({ requestBody: { code: normalizedCode } });
  }, [presetCode, pairingId, normalizedCode, resolveMutate]);

  const hasProof = byPattern ? current?.round != null && current.pattern != null : normalizedCode !== null;
  const targetKnown = mode !== 'takeover' || targetReaderId !== undefined;
  const canApprove = current !== null && !finished && targetKnown && idle && hasProof && !blocked;

  const submit = async () => {
    if (!current || !canApprove || submitting.current) return;
    submitting.current = true;
    setError(null);
    setNotice(null);
    const base = approvalBase({ mode, targetReaderId, name, via: props.via });
    if (!byPattern) {
      sentCode.current = normalizedCode;
      approve.mutate({ pairingId: current.id, requestBody: { ...base, code: normalizedCode ?? undefined } });
      return;
    }
    // Read again right before approving: a pattern that rotated while the admin was comparing must be
    // looked at again, never approved from an old screen.
    const fresh = (await refetch()).data;
    if (!fresh || fresh.round == null || fresh.round !== shownRound.current) {
      submitting.current = false;
      setNotice(t('dialog.patternChanged'));
      return;
    }
    approve.mutate({ pairingId: current.id, requestBody: { ...base, round: fresh.round } });
  };

  // The round on screen, so it always matches what the admin can see.
  shownRound.current = byPattern ? (current?.round ?? null) : null;

  const waitingForReader = props.waitForReaderId !== undefined && !active.activeId && !active.noResponse;
  const needsCodeToFind = !active.activeId && !waitingForReader && !active.noResponse;
  // Typing a new code answers an error about the old one, but not a wait the server asked for.
  const clearError = () => setError((previous) => (previous?.kind === 'rateLimited' ? previous : null));
  return {
    ...active,
    t,
    readers,
    codeInput,
    codeRejected: code.codeRejected,
    setCodeInput: (value: string) => {
      code.setOwnCode(value.toUpperCase());
      clearError();
    },
    setCodeFromScan: (value: string) => {
      code.setOwnCode(value);
      clearError();
    },
    setPickedId,
    /** Back to the list of waiting Lite readers after one was picked. */
    pickedFromList: pickedId !== null && active.activeId === pickedId && !finished,
    backToList: () => {
      setPickedId(null);
      setError(null);
      setNotice(null);
    },
    choice,
    setChoice,
    pickedTarget,
    setPickedTarget,
    name,
    setName,
    error: visibleError(error, countdown.secondsLeft, finished),
    notice,
    idle,
    normalizedCode,
    bound,
    byPattern,
    finished,
    canFind,
    canApprove,
    submit,
    findByCode,
    /** Enter in the dialog: look the reader up while it is not known, otherwise approve. */
    submitForm: () => (needsCodeToFind ? findByCode() : void submit()),
    /** The dialog's Cancel button: ends the waiting request on the server, then closes. */
    cancel: cancelAndClose,
    resolvePending: resolve.isPending,
    approvePending: approve.isPending,
    waitingForReader,
    needsCodeToFind,
    needsChoice: current !== null && !finished && !bound && props.presetTargetReaderId === undefined,
  };
}

export type PairingFlow = ReturnType<typeof usePairingFlow>;
