import { useEffect, useMemo, useState } from 'react';
import { useSystemServiceInfo } from '@attraccess/react-query-client';

interface Options {
  consecutiveErrorThreshold?: number;
  refetchIntervalMs?: number;
}

export function useReliableServerAvailability(options: Options = {}) {
  const { consecutiveErrorThreshold = 2, refetchIntervalMs = 3000 } = options;

  const [errorStreak, setErrorStreak] = useState(0);

  const query = useSystemServiceInfo(undefined, {
    retry: false,
  });

  useEffect(() => {
    const run = async () => {
      const result = await query.refetch();
      if (result.isSuccess) {
        setErrorStreak(0);
        return;
      }

      setErrorStreak((prev) => Math.min(prev + 1, consecutiveErrorThreshold));
    };

    run();
    const intervalId = setInterval(run, refetchIntervalMs);
    return () => clearInterval(intervalId);
  }, [query, consecutiveErrorThreshold, refetchIntervalMs]);

  const isServerLikelyDown = useMemo(
    () => errorStreak >= consecutiveErrorThreshold,
    [errorStreak, consecutiveErrorThreshold],
  );

  return {
    isServerLikelyDown,
    errorStreak,
    data: query.data,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
