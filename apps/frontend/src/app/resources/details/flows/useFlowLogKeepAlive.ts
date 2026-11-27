import { useEffect, useRef, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../components/toastProvider';
import { FlowOwner, flowOwnerKey, useKeepFlowLogRecordingAliveRequest } from './flowOwner';
import de from './de.json';
import en from './en.json';

const MINUTE = 60_000;

/** When this page renews the flow log recording and when it gives up; injectable for tests. */
export interface FlowLogKeepAliveTiming {
  /** Minimum time between two renewals, and how often idle time is re-evaluated. */
  renewIntervalMs: number;
  /** Input-free time after which the warning shows and the last renewal is sent. */
  idleWarningMs: number;
  /** Input-free time after which this page no longer keeps logging on. */
  idleTimeoutMs: number;
  /** Input within this time of the previous one is ignored, which keeps the handlers cheap. */
  inputThrottleMs: number;
}

export const FLOW_LOG_KEEP_ALIVE_TIMING: FlowLogKeepAliveTiming = {
  renewIntervalMs: MINUTE,
  idleWarningMs: 15 * MINUTE,
  idleTimeoutMs: 30 * MINUTE,
  inputThrottleMs: 1_000,
};

const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
// Timers may fire a little early; a renewal that is due within this slack is sent on the current tick.
const TICK_SLACK_MS = 1_000;

type IdlePhase = 'active' | 'warned' | 'timedOut';

/**
 * Keeps the owner's flow log recording alive while someone uses this page. Mounted once per FlowProvider.
 *
 * Idle time is always `Date.now() - lastInputAt`, so throttled timers and a sleeping laptop cannot stretch
 * it. While idle is below the warning threshold the recording is renewed about once a minute; one final
 * renewal is sent at the warning mark, so the server's 15 minute window ends at about 30 minutes of idle.
 * An idle page only stops renewing: it never stops a recording someone else keeps alive.
 *
 * @returns whether this page stopped keeping logging on because nobody used it.
 */
export function useFlowLogKeepAlive(owner: FlowOwner, timing: FlowLogKeepAliveTiming = FLOW_LOG_KEEP_ALIVE_TIMING) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const keepAlive = useKeepFlowLogRecordingAliveRequest(owner);
  const [isPausedForInactivity, setPausedForInactivity] = useState(false);

  // Handlers read the latest values through refs; the effect below only restarts for a new owner.
  const latest = useRef({ keepAlive, toast, t, timing });
  latest.current = { keepAlive, toast, t, timing };
  const ownerKey = flowOwnerKey(owner);

  useEffect(() => {
    const toastId = `flow-log-keep-alive:${ownerKey}`;
    const { toast: toastOfMount } = latest.current;
    let lastInputAt = Date.now();
    let lastRenewalAt = 0;
    let phase: IdlePhase = 'active';
    let finalRenewalTimer: ReturnType<typeof setTimeout> | undefined;

    const renew = () => {
      lastRenewalAt = Date.now();
      latest.current.keepAlive();
    };

    const enterPhase = (next: IdlePhase) => {
      if (phase === next) return;
      phase = next;
      const { toast, t } = latest.current;
      setPausedForInactivity(next === 'timedOut');
      if (next === 'active') {
        toast.dismiss(toastId);
      } else if (next === 'warned') {
        toast.showToast({
          id: toastId,
          type: 'warning',
          title: t('logKeepAlive.warning.title'),
          description: t('logKeepAlive.warning.description'),
          duration: Infinity,
          action: { label: t('logKeepAlive.warning.action'), onClick: () => onInput(true) },
        });
      } else {
        toast.showToast({
          id: toastId,
          type: 'info',
          title: t('logKeepAlive.timedOut.title'),
          description: t('logKeepAlive.timedOut.description'),
          duration: Infinity,
        });
      }
    };

    const evaluate = () => {
      const { renewIntervalMs, idleWarningMs, idleTimeoutMs } = latest.current.timing;
      const now = Date.now();
      // A wall clock that was set back makes these negative; treat that as fresh input and a due renewal,
      // or an active page would stop renewing until the clock caught up again.
      if (now < lastInputAt) lastInputAt = now;
      const sinceRenewal = now - lastRenewalAt;
      const idle = now - lastInputAt;
      if (idle >= idleTimeoutMs) {
        enterPhase('timedOut');
      } else if (idle >= idleWarningMs) {
        enterPhase('warned');
      } else if (
        (sinceRenewal < 0 || sinceRenewal >= renewIntervalMs - TICK_SLACK_MS) &&
        // The final renewal at the warning mark follows within a tick; renewing now as well would send two.
        idleWarningMs - idle >= renewIntervalMs - TICK_SLACK_MS
      ) {
        renew();
      }
    };

    // The last renewal belongs to the warning mark. A timer that fires much later (sleep, a throttled
    // background tab) sends nothing, so a page woken after a long sleep never extends a recording.
    const scheduleFinalRenewal = () => {
      if (finalRenewalTimer !== undefined) return;
      const mark = lastInputAt + latest.current.timing.idleWarningMs;
      finalRenewalTimer = setTimeout(
        () => {
          finalRenewalTimer = undefined;
          const now = Date.now();
          const markNow = lastInputAt + latest.current.timing.idleWarningMs;
          if (now < markNow - TICK_SLACK_MS) {
            // Input since scheduling moved the mark.
            scheduleFinalRenewal();
            return;
          }
          if (now - markNow <= latest.current.timing.renewIntervalMs) renew();
          evaluate();
        },
        Math.max(0, mark - Date.now()),
      );
    };

    function onInput(force = false) {
      const now = Date.now();
      if (!force && phase === 'active' && now - lastInputAt < latest.current.timing.inputThrottleMs) return;
      lastInputAt = now;
      scheduleFinalRenewal();
      if (phase !== 'active') {
        enterPhase('active');
        renew();
        return;
      }
      evaluate();
    }

    const onActivity = () => onInput();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') evaluate();
    };

    const listenerOptions: AddEventListenerOptions = { passive: true, capture: true };
    INPUT_EVENTS.forEach((type) => window.addEventListener(type, onActivity, listenerOptions));
    window.addEventListener('focus', onActivity);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const tick = setInterval(evaluate, latest.current.timing.renewIntervalMs);

    // Opening the editor counts as input.
    renew();
    scheduleFinalRenewal();

    return () => {
      INPUT_EVENTS.forEach((type) => window.removeEventListener(type, onActivity, listenerOptions));
      window.removeEventListener('focus', onActivity);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(tick);
      clearTimeout(finalRenewalTimer);
      toastOfMount.dismiss(toastId);
    };
  }, [ownerKey]);

  return { isPausedForInactivity };
}
