// State machine for the mass-introduction tab of the grant-introduction drawer
// FEATURE: ATT-1151 Mass introduction
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessControlService,
  ApiError,
  MassIntroductionEndReason,
  MassIntroductionLiveEventDto,
  MassIntroductionLiveEventType,
  MassIntroductionSessionDto,
  useAccessControlServiceMassIntroductionCancel,
  useAccessControlServiceMassIntroductionStart,
} from '@attraccess/react-query-client';
import { useLiveUpdates } from '../../../../utils/live-updates';
import { getApiErrorMessage } from '../../../../utils/apiError';
import { useInvalidatePeopleIntroductions } from '../usePeopleMutations';
import { PeopleTarget } from '../types';

export type MassIntroductionPhase = 'setup' | 'active' | 'ended';
/** `unknown`: the server no longer knows the session (e.g. it ended while the stream was down). */
export type MassIntroductionEndState = MassIntroductionEndReason | 'unknown';

export function secondsUntil(timestamp: string): number {
  return Math.max(0, Math.ceil((new Date(timestamp).getTime() - Date.now()) / 1000));
}

export type MassIntroductionSessionState = ReturnType<typeof useMassIntroductionSession>;

export function useMassIntroductionSession(target: PeopleTarget) {
  const invalidateIntroductions = useInvalidatePeopleIntroductions(target);
  const [session, setSession] = useState<MassIntroductionSessionDto | null>(null);
  const [endReason, setEndReason] = useState<MassIntroductionEndState | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  // Bumped when fetching the next join code failed, to schedule another attempt.
  const [refreshRetry, setRefreshRetry] = useState(0);

  // The id of the session that is still running server-side, as far as this drawer knows.
  const activeSessionIdRef = useRef<string | null>(null);
  const sessionRef = useRef<MassIntroductionSessionDto | null>(null);

  const phase: MassIntroductionPhase = endReason ? 'ended' : session ? 'active' : 'setup';

  const applySession = useCallback(
    (next: MassIntroductionSessionDto) => {
      const previous = sessionRef.current;
      sessionRef.current = next;
      setSession(next);
      const knownUserIds = new Set(previous?.participants.map((participant) => participant.userId));
      next.participants
        .filter((participant) => !knownUserIds.has(participant.userId))
        .forEach((participant) => invalidateIntroductions(participant.userId));
    },
    [invalidateIntroductions],
  );

  const markEnded = useCallback((reason: MassIntroductionEndState) => {
    activeSessionIdRef.current = null;
    setEndReason(reason);
  }, []);

  const startMutation = useAccessControlServiceMassIntroductionStart({
    onSuccess: (started) => {
      activeSessionIdRef.current = started.id;
      sessionRef.current = null;
      setEndReason(null);
      setSecondsLeft(secondsUntil(started.expiresAt));
      applySession(started);
    },
    onError: (error) => setStartError(getApiErrorMessage(error as ApiError)),
  });
  const { mutate: cancelMutate } = useAccessControlServiceMassIntroductionCancel();
  // The unmount cleanup below must not re-run (and cancel early) if the mutate identity ever changes.
  const cancelMutateRef = useRef(cancelMutate);
  cancelMutateRef.current = cancelMutate;

  const start = useCallback(
    (readerId?: number) => {
      setStartError(null);
      startMutation.mutate({
        requestBody: {
          ...(target.type === 'resource' ? { resourceId: target.id } : { resourceGroupId: target.id }),
          ...(readerId !== undefined ? { readerId } : {}),
        },
      });
    },
    [startMutation, target.id, target.type],
  );

  /** Ends the session server-side if it is still running; safe to call repeatedly. */
  const cancel = useCallback(() => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    activeSessionIdRef.current = null;
    cancelMutate({ sessionId });
    setEndReason(MassIntroductionEndReason.CANCELLED);
  }, [cancelMutate]);

  /** Back to the setup step, e.g. to create a fresh QR code after the previous one ended. */
  const reset = useCallback(() => {
    cancel();
    sessionRef.current = null;
    setSession(null);
    setEndReason(null);
    setStartError(null);
  }, [cancel]);

  // Closing the drawer or navigating away must not leave a QR code (and reader) running.
  useEffect(() => {
    return () => {
      const sessionId = activeSessionIdRef.current;
      if (sessionId) {
        activeSessionIdRef.current = null;
        cancelMutateRef.current({ sessionId });
      }
    };
  }, []);

  const expiresAt = phase === 'active' ? session?.expiresAt : undefined;
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const remaining = secondsUntil(expiresAt);
      setSecondsLeft(remaining);
      // The server expires the session by itself; nothing to cancel.
      if (remaining <= 0) markEnded(MassIntroductionEndReason.EXPIRED);
      return remaining;
    };
    if (tick() <= 0) return;
    const interval = setInterval(() => {
      if (tick() <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, markEnded]);

  const handleLiveEvent = useCallback(
    (event: MassIntroductionLiveEventDto) => {
      if (!activeSessionIdRef.current || event.sessionId !== activeSessionIdRef.current) return;
      if (event.type === MassIntroductionLiveEventType.UPDATED && event.session) {
        applySession(event.session);
      } else if (event.type === MassIntroductionLiveEventType.ENDED) {
        markEnded(event.reason ?? 'unknown');
      }
    },
    [applySession, markEnded],
  );

  // Events may have been missed while the stream was down: resync from the server.
  const resync = useCallback(() => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    AccessControlService.massIntroductionGet({ sessionId }).then(
      (current) => {
        if (activeSessionIdRef.current === sessionId) applySession(current);
      },
      (error) => {
        if (activeSessionIdRef.current !== sessionId) return;
        if ((error as ApiError)?.status === 404) markEnded('unknown');
        else setRefreshRetry((attempt) => attempt + 1);
      },
    );
  }, [applySession, markEnded]);

  // The join code changes every 15 seconds so a photo of it cannot be passed on; fetch the next one
  // as soon as it rotates.
  const codeRefreshAt = phase === 'active' ? session?.codeRefreshAt : undefined;
  useEffect(() => {
    if (!codeRefreshAt) return;
    const dueInMs = new Date(codeRefreshAt).getTime() - Date.now();
    const timeout = setTimeout(resync, dueInMs > 0 ? dueInMs + 250 : 2000);
    return () => clearTimeout(timeout);
  }, [codeRefreshAt, refreshRetry, resync]);

  // Subscribed for as long as the drawer is open, so no event right after starting is missed.
  useLiveUpdates({ topic: 'mass-introduction', onUpdate: handleLiveEvent, onReconnect: resync });

  return {
    phase,
    session,
    endReason,
    secondsLeft,
    startError,
    isStarting: startMutation.isPending,
    start,
    cancel,
    reset,
  } as const;
}
