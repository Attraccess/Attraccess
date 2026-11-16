import { useCallback, useEffect, useRef, useState } from 'react';
import JSConfetti from 'js-confetti';
import { ResourceFlowLog } from '@attraccess/react-query-client';
import { useFlowContext } from '../context/index';

/**
 * Follows the live logs of a flow run: tells whether the flow is running (edges animate) and, when enabled,
 * throws confetti when a run completes (sad emoji when a node failed).
 */
export function useFlowRunFeedback() {
  const { addLiveLogReceiver, removeLiveLogReceiver } = useFlowContext();
  const [flowIsRunning, setFlowIsRunning] = useState(false);
  const flowExecutionHadError = useRef(false);
  const [confettiEnabled, setConfettiEnabled] = useState(false);
  const confettiRef = useRef<JSConfetti | null>(null);

  useEffect(() => {
    if (!confettiEnabled) return;

    const confetti = new JSConfetti();
    confettiRef.current = confetti;
    return () => {
      confettiRef.current = null;
      confetti.clearCanvas();
      confetti.destroyCanvas();
    };
  }, [confettiEnabled]);

  const onLiveLog = useCallback((log: ResourceFlowLog) => {
    if (log.type === 'node.processing.failed') {
      flowExecutionHadError.current = true;
      return;
    }

    if (log.type === 'flow.start') {
      setFlowIsRunning(true);
      return;
    }

    if (log.type === 'flow.completed') {
      setFlowIsRunning(false);

      if (!flowExecutionHadError.current) {
        confettiRef.current?.addConfetti();
      } else {
        confettiRef.current?.addConfetti({
          emojis: ['❌', '😢', '💔', '😭', '🚫', '⚠️', '💥', '👎'],
          emojiSize: 100,
          confettiNumber: 2,
        });
      }

      flowExecutionHadError.current = false;
    }
  }, []);

  useEffect(() => {
    addLiveLogReceiver(onLiveLog);
    return () => {
      removeLiveLogReceiver(onLiveLog);
    };
  }, [addLiveLogReceiver, removeLiveLogReceiver, onLiveLog]);

  return { flowIsRunning, confettiEnabled, setConfettiEnabled };
}
