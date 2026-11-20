import {
  Attractap,
  PairingDto,
  useApprovePairing,
  useCancelPairing,
  useGetPairing,
  useGetPairings,
  useGetPairingsKey,
  useGetReaderByIdKey,
  useGetReaderCredentialHistoryKey,
  useGetReaders,
  useGetReadersToPair,
  useGetReadersToPairKey,
  useGetReadersKey,
  useResolvePairing,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { normalizeEnrollmentCode } from './enrollmentCode';
import { readerTypeOf } from './PairingRow';
import { useRetryCountdown } from './useRetryCountdown';
import { classifyPairingError, isPairingRunning, PairingError, TERMINAL_PAIRING_STATES } from './pairingUtils';
import de from './de.json';
import en from './en.json';

export type Choice = 'new' | 'takeover';
type Mode = 'new' | 'takeover';

export interface PairingFlowProps {
  pairingId?: string;
  presetCode?: string;
  via?: 'flasher';
  presetTargetReaderId?: number;
  onClose: () => void;
  onPaired?: (readerId: number) => void;
}

const POLL_INTERVAL_MS = 1000;
// After these the request moved on or ended: read it again so the dialog shows what the reader shows.
const REREAD_ERRORS: ReadonlySet<string> = new Set(['stale', 'notWaiting', 'failed', 'readerGone']);
// The request is over; once the dialog shows how it ended, the error would only repeat it.
const ENDED_ERRORS: ReadonlySet<string> = new Set(['notWaiting', 'failed', 'readerGone']);

export const isFinished = (pairing: PairingDto | null) =>
  pairing !== null && TERMINAL_PAIRING_STATES.includes(pairing.state);

/**
 * Paired records and records whose pairing was removed in one list. A reader that was just paired can briefly be
 * in both lists; it is listed once, as the paired entry.
 */
export function mergeReaderLists(paired?: Attractap[], removed?: Attractap[]): Attractap[] | undefined {
  if (!paired && !removed) return undefined;
  const pairedIds = new Set((paired ?? []).map((reader) => reader.id));
  return [...(paired ?? []), ...(removed ?? []).filter((reader) => !pairedIds.has(reader.id))];
}

/** What the reader becomes: a takeover of a chosen record, or a new record. */
export function modeOf(hasPresetTarget: boolean, choice: Choice): Mode {
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

/** Finds the request the dialog works on: given, picked, or found by code. */
function useActivePairing(props: PairingFlowProps, resolved: PairingDto | null, pickedId: string | null) {
  const { data: allPairings } = useGetPairings({}, undefined, { refetchInterval: POLL_INTERVAL_MS });
  const running = useMemo(() => (allPairings ?? []).filter((p) => isPairingRunning(p.state)), [allPairings]);

  const activeId = props.pairingId ?? pickedId ?? resolved?.id ?? null;
  const query = useGetPairing({ path: { pairingId: activeId ?? '' } }, undefined, {
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
  const cancelPairing = useCancelPairing(undefined, { onSettled: () => void refresh() });
  return () => {
    if (current && isPairingRunning(current.state) && !approving())
      cancelPairing.mutate({ path: { pairingId: current.id } });
    onClose();
  };
}

/** Everything the pairing dialog and its steps read from, and call on, the pairing flow. */
export interface PairingFlow {
  running: PairingDto[];
  activeId: string | null;
  current: PairingDto | null;
  resolvedByCode: boolean;
  pollingFailed: boolean;
  readers: Attractap[] | undefined;
  codeInput: string;
  codeRejected: boolean;
  setCodeInput: (value: string) => void;
  setCodeFromScan: (value: string) => void;
  setPickedId: (id: string | null) => void;
  /** Back to the list of waiting Lite readers after one was picked. */
  pickedFromList: boolean;
  backToList: () => void;
  choice: Choice;
  setChoice: (choice: Choice) => void;
  pickedTarget: number | undefined;
  setPickedTarget: (readerId: number | undefined) => void;
  name: string;
  setName: (name: string) => void;
  error: PairingError | null;
  notice: string | null;
  idle: boolean;
  normalizedCode: string | null;
  /** A BLE bridge: no screen or ring, its code is on its setup page. */
  bleBridge: boolean;
  byPattern: boolean;
  finished: boolean;
  canFind: boolean;
  canApprove: boolean;
  submit: () => Promise<void>;
  findByCode: () => void;
  /** Enter in the dialog: look the reader up while it is not known, otherwise approve. */
  submitForm: () => void;
  /** The dialog's Cancel button: ends the waiting request on the server, then closes. */
  cancel: () => void;
  resolvePending: boolean;
  approvePending: boolean;
  needsCodeToFind: boolean;
  needsChoice: boolean;
}

/** Shared by PairingDialog and its step components: the pairing request, the admin's inputs and the approval. */
export function usePairingFlow(props: PairingFlowProps): PairingFlow {
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
  // The pairing session sees every reader record: paired ones and the ones whose pairing was removed.
  const { data: pairedReaders } = useGetReaders();
  const { data: removedReaders } = useGetReadersToPair();
  const readers = useMemo(() => mergeReaderLists(pairedReaders, removedReaders), [pairedReaders, removedReaders]);

  const refreshLists = () =>
    Promise.all(
      [
        useGetReadersKey,
        useGetReadersToPairKey,
        useGetReaderByIdKey,
        useGetReaderCredentialHistoryKey,
        useGetPairingsKey,
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );

  const failed = (classified: PairingError) => {
    submitting.current = false;
    setError(classified);
    if (classified.retryAfterSeconds) countdown.start(classified.retryAfterSeconds);
  };

  // Tracked here instead of the mutation's isPending: the `?enroll=` / flasher lookup starts from an effect
  // on mount, and StrictMode's simulated unmount detaches the mutation observer, which then reports
  // "pending" forever and kept Approve disabled. The mutation's own callbacks always run.
  const [resolving, setResolving] = useState(false);
  const resolve = useResolvePairing(undefined, {
    onMutate: () => setResolving(true),
    onSettled: () => setResolving(false),
    onSuccess: (found) => {
      submitting.current = false;
      setResolved(found);
      setError(null);
    },
    onError: (failure) => failed(classifyPairingError(failure, true)),
  });

  const approve = useApprovePairing(undefined, {
    onSuccess: async (done) => {
      await refreshLists();
      submitting.current = false;
      // A preset target means the record was paired before: it is paired again.
      const title = props.presetTargetReaderId === undefined ? 'dialog.paired' : 'security.pairedAgain';
      toast.success({ title: t(title), duration: 2500 });
      const readerId = done.targetReaderId;
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

  const idle = !resolving && !approve.isPending;
  const cancelAndClose = useCancelAndClose(
    current,
    () => approve.isPending || submitting.current,
    onClose,
    refreshLists,
  );
  const blocked = countdown.secondsLeft > 0;
  const normalizedCode = normalizeEnrollmentCode(codeInput);
  const mode = modeOf(!!props.presetTargetReaderId, choice);
  const targetReaderId = props.presetTargetReaderId ?? pickedTarget;
  // A Lite reader that was not found by its code is compared by its colour pattern. A BLE bridge pairs like a
  // Lite but has no ring: its code is on its setup page, so it is always proved by code.
  const bleBridge = !!current && readerTypeOf(current.firmware, current.kind) === 'bridge';
  const byPattern = current?.kind === 'lite' && !resolvedByCode && !bleBridge;
  const finished = isFinished(current);
  const canFind = normalizedCode !== null && idle && !blocked;

  const findByCode = () => {
    if (!canFind || submitting.current) return;
    submitting.current = true;
    setError(null);
    resolve.mutate({ body: { code: normalizedCode } });
  };

  // `?enroll=CODE` and the web flasher arrive with the code: look the reader up right away.
  const autoResolved = useRef(false);
  const { presetCode, pairingId } = props;
  const { mutate: resolveMutate } = resolve;
  useEffect(() => {
    if (autoResolved.current || !presetCode || pairingId || !normalizedCode) return;
    autoResolved.current = true;
    resolveMutate({ body: { code: normalizedCode } });
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
      approve.mutate({ path: { pairingId: current.id }, body: { ...base, code: normalizedCode ?? undefined } });
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
    approve.mutate({ path: { pairingId: current.id }, body: { ...base, round: fresh.round } });
  };

  // The round on screen, so it always matches what the admin can see.
  shownRound.current = byPattern ? (current?.round ?? null) : null;

  const needsCodeToFind = !active.activeId;
  // Typing a new code answers an error about the old one, but not a wait the server asked for.
  const clearError = () => setError((previous) => (previous?.kind === 'rateLimited' ? previous : null));
  return {
    running: active.running,
    activeId: active.activeId,
    current,
    resolvedByCode,
    pollingFailed: active.pollingFailed,
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
    bleBridge,
    byPattern,
    finished,
    canFind,
    canApprove,
    submit,
    findByCode,
    submitForm: () => (needsCodeToFind ? findByCode() : void submit()),
    cancel: cancelAndClose,
    resolvePending: resolving,
    approvePending: approve.isPending,
    needsCodeToFind,
    needsChoice: current !== null && !finished && props.presetTargetReaderId === undefined,
  };
}
