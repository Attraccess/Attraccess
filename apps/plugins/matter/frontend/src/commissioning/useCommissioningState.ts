import { useCallback, useEffect, useRef, useState } from 'react';
import { statusOf } from '../matterApi';
import {
  cancelSession,
  getCurrentSession,
  getSession,
  isActive,
  startCommissioning,
  type CommissioningSessionView,
  type StartRequest,
} from './api';

/** How long after an answer a running session is read again. */
export const SESSION_POLL_MS = 1_000;

/** A failed request of the flow and which one it was, so each step shows only its own. */
export interface CommissioningRequestFailure {
  kind: 'load' | 'start' | 'poll' | 'cancel';
  error: unknown;
}

export interface CommissioningState {
  session: CommissioningSessionView | null;
  /** True until the first answer of `current`. */
  loading: boolean;
  /** The last failed request; a successful read clears a failed read, a new start or cancel clears the rest. */
  failure: CommissioningRequestFailure | null;
  /** True while a start request is in flight. */
  starting: boolean;
  /** Rejects when the start failed (the failure is also in `failure`). */
  start: (request: StartRequest) => Promise<void>;
  /** Never rejects: a failed cancellation is reported in `failure`. */
  cancel: () => Promise<void>;
  /** Forgets the finished session on this page (nothing is sent): back to entering a code. */
  reset: () => void;
}

/**
 * The backend no longer knows the session (404: the plugin or the API restarted and sessions live in memory only).
 * The page ends it as interrupted: never resumed, the person starts again and checks Devices.
 */
const interruptedHere = (session: CommissioningSessionView): CommissioningSessionView => ({
  ...session,
  state: 'interrupted',
  failure: { code: 'interrupted' },
  finishedAt: new Date().toISOString(),
});

/**
 * The session of the signed-in user, shared by the commissioning flow's steps (CommissioningFlow, ProgressStep,
 * FailureScreen, FinishStep). Loads the caller's current session once, so returning to the page resumes it, and reads an
 * active session again one second after each answer (never two reads at once). It holds sessions only, never a setup
 * code.
 */
export function useCommissioningState(): CommissioningState {
  const [session, setSession] = useState<CommissioningSessionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<CommissioningRequestFailure | null>(null);
  const [starting, setStarting] = useState(false);
  const mounted = useRef(true);
  /** A session the person dismissed must not come back from `current`. */
  const dismissed = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getCurrentSession()
      .then((current) => {
        if (!cancelled && current && current.id !== dismissed.current) setSession(current);
      })
      .catch((error: unknown) => !cancelled && setFailure({ kind: 'load', error }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  /** Replaces the session only if it is still the one the answer is about. */
  const update = useCallback((id: string, next: (previous: CommissioningSessionView) => CommissioningSessionView) => {
    setSession((previous) => (previous?.id === id ? next(previous) : previous));
  }, []);

  const id = session?.id;
  const active = session ? isActive(session) : false;
  useEffect(() => {
    if (!id || !active) return;
    // Set when the session changed, ended or the page was left: an answer that arrives later is dropped.
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const next = await getSession(id);
        if (stopped) return;
        update(id, () => next);
        setFailure((previous) => (previous?.kind === 'poll' ? null : previous));
      } catch (error) {
        if (stopped) return;
        if (statusOf(error) === 404) {
          update(id, interruptedHere);
          setFailure(null);
          return;
        }
        setFailure({ kind: 'poll', error });
      }
      if (!stopped) timer = setTimeout(() => void read(), SESSION_POLL_MS);
    };
    timer = setTimeout(() => void read(), SESSION_POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, active, update]);

  const start = useCallback(async (request: StartRequest) => {
    setStarting(true);
    setFailure(null);
    try {
      const created = await startCommissioning(request);
      if (mounted.current) setSession(created);
    } catch (error) {
      if (mounted.current) setFailure({ kind: 'start', error });
      throw error;
    } finally {
      if (mounted.current) setStarting(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    if (!id) return;
    setFailure(null);
    try {
      const next = await cancelSession(id);
      if (mounted.current) update(id, () => next);
    } catch (error) {
      if (!mounted.current) return;
      if (statusOf(error) === 404) update(id, interruptedHere);
      else setFailure({ kind: 'cancel', error });
    }
  }, [id, update]);

  const reset = useCallback(() => {
    dismissed.current = id ?? null;
    setSession(null);
    setFailure(null);
  }, [id]);

  return { session, loading, failure, starting, start, cancel, reset };
}
