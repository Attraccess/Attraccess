import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../errorMessage';
import {
  cancelSession,
  getCurrentSession,
  getSession,
  isActive,
  startCommissioning,
  type CommissioningSessionView,
  type StartRequest,
} from './api';

/** How often a running session is read again. */
export const SESSION_POLL_MS = 1_000;

export interface CommissioningState {
  session: CommissioningSessionView | null;
  /** True until the first answer of `current`. */
  loading: boolean;
  error: string | null;
  /** True while a start request is in flight. */
  starting: boolean;
  start: (request: StartRequest) => Promise<void>;
  cancel: () => Promise<void>;
  /** Forgets the finished session on this page (nothing is sent): back to entering a code. */
  reset: () => void;
  setSession: (session: CommissioningSessionView) => void;
}

/**
 * The session of the signed-in user, shared by the commissioning flow's steps (CommissioningFlow, ProgressStep,
 * FailureScreen, FinishStep). Loads the caller's current session once, so returning to the page resumes it, and reads an
 * active session every second. It holds sessions only, never a setup code.
 */
export function useCommissioningState(enabled: boolean): CommissioningState {
  const [session, setSession] = useState<CommissioningSessionView | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
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
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getCurrentSession()
      .then((current) => {
        if (!cancelled && current && current.id !== dismissed.current) setSession(current);
      })
      .catch((failure: unknown) => !cancelled && setError(errorMessage(failure)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const id = session?.id;
  const active = session ? isActive(session) : false;
  useEffect(() => {
    if (!id || !active) return;
    const timer = setInterval(() => {
      getSession(id)
        .then((next) => {
          if (!mounted.current) return;
          setSession((previous) => (previous?.id === id ? next : previous));
          setError(null);
        })
        .catch((failure: unknown) => mounted.current && setError(errorMessage(failure)));
    }, SESSION_POLL_MS);
    return () => clearInterval(timer);
  }, [id, active]);

  const start = useCallback(async (request: StartRequest) => {
    setStarting(true);
    setError(null);
    try {
      const created = await startCommissioning(request);
      if (mounted.current) setSession(created);
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
      throw failure;
    } finally {
      if (mounted.current) setStarting(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    if (!id) return;
    const next = await cancelSession(id);
    if (mounted.current) setSession(next);
  }, [id]);

  const reset = useCallback(() => {
    dismissed.current = id ?? null;
    setSession(null);
    setError(null);
  }, [id]);

  return { session, loading, error, starting, start, cancel, reset, setSession };
}
