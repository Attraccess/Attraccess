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
const STALE_ERRORS: ReadonlySet<string> = new Set(['stale', 'notWaiting']);

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

/** Finds the request the dialog works on: given, announced by a token reader, picked, or found by code. */
function useActivePairing(props: PairingFlowProps, resolved: PairingDto | null, pickedId: string | null) {
  const { waitForReaderId, pairingId } = props;
  const [noResponse, setNoResponse] = useState(false);
  const { data: allPairings } = useAttractapServiceGetPairings(undefined, { refetchInterval: POLL_INTERVAL_MS });
  const running = useMemo(() => (allPairings ?? []).filter((p) => isPairingRunning(p.state)), [allPairings]);
  const arrived = running.find((p) => waitForReaderId !== undefined && p.boundReaderId === waitForReaderId);

  // A reader that was asked to pair but never connects is off or runs software that cannot pair yet.
  const waiting = waitForReaderId !== undefined && !pairingId && !arrived;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setNoResponse(true), NO_RESPONSE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  const activeId = pairingId ?? arrived?.id ?? pickedId ?? resolved?.id ?? null;
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

export function usePairingFlow(props: PairingFlowProps) {
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
  // Ring pattern the admin has in front of them; approving sends this round only if it is still the current one.
  const shownRound = useRef<number | null>(null);
  // isPending only flips after the next render, so a double click would send the request twice.
  const submitting = useRef(false);

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
      toast.success({ title: t('dialog.paired'), duration: 2500 });
      const readerId = done.targetReaderId ?? done.boundReaderId;
      if (readerId === null) onClose();
      else props.onPaired?.(readerId);
    },
    onError: (failure) => {
      submitting.current = false;
      const classified = classifyPairingError(failure);
      setError(classified);
      // The pattern moved on, or the request is over: show what the reader shows now.
      if (STALE_ERRORS.has(classified.kind)) void refetch();
    },
  });

  const idle = !resolve.isPending && !approve.isPending;
  const normalizedCode = normalizeEnrollmentCode(codeInput);
  const bound = current?.boundReaderId != null;
  const mode = modeOf(bound, !!props.presetTargetReaderId, choice);
  const targetReaderId = props.presetTargetReaderId ?? pickedTarget;
  // A Lite reader that was not found by its code is compared by its colour pattern.
  const byPattern = current?.kind === 'lite' && !resolvedByCode;
  const finished = isFinished(current);

  const findByCode = () => {
    if (!normalizedCode || !idle) return;
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
  const canApprove = current !== null && !finished && targetKnown && idle && hasProof;

  const submit = async () => {
    if (!current || !canApprove || submitting.current) return;
    submitting.current = true;
    setError(null);
    setNotice(null);
    const base = approvalBase({ mode, targetReaderId, name, via: props.via });
    if (!byPattern) {
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
  return {
    ...active,
    t,
    readers,
    codeInput,
    setCodeInput: (value: string) => {
      setCodeInput(value.toUpperCase());
      setError(null);
    },
    setCodeFromScan: (value: string) => {
      setCodeInput(value);
      setError(null);
    },
    setPickedId,
    choice,
    setChoice,
    pickedTarget,
    setPickedTarget,
    name,
    setName,
    error,
    notice,
    idle,
    normalizedCode,
    bound,
    byPattern,
    finished,
    canApprove,
    submit,
    findByCode,
    resolvePending: resolve.isPending,
    approvePending: approve.isPending,
    waitingForReader,
    needsCodeToFind: !active.activeId && !waitingForReader && !active.noResponse,
    needsChoice: current !== null && !finished && !bound && props.presetTargetReaderId === undefined,
  };
}

export type PairingFlow = ReturnType<typeof usePairingFlow>;
