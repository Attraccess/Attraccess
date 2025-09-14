import { BillingTransaction } from '@attraccess/react-query-client';
import { getBaseUrl } from '../../../../api';
import { events } from 'fetch-event-stream';
import { useCallback, useEffect } from 'react';

interface Props {
  onUpdate: (transaction: BillingTransaction) => void;
}

export function useLiveTransactionUpdates(props: Props) {
  const { onUpdate } = props;
  const connectToLiveLogs = useCallback(async () => {
    const url = `${getBaseUrl()}/api/billing/transactions/live`;

    const abortController = new AbortController();

    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include', // Include cookies for authentication
      signal: abortController.signal,
    });

    if (!res.ok) {
      throw new Error(`Failed to connect to SSE: ${res.status} ${res.statusText}`);
    }

    const stream = events(res, abortController.signal);

    for await (const event of stream) {
      try {
        const nextPacket = JSON.parse(event.data as string);

        if (nextPacket.keepalive) {
          continue;
        }

        onUpdate(nextPacket);
      } catch (parseError) {
        console.error('[useLiveTransactionUpdates] Error parsing event data:', parseError, event);
      }
    }
  }, [onUpdate]);

  useEffect(() => {
    connectToLiveLogs();
  }, [connectToLiveLogs]);
}
