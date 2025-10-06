import { useEffect, useMemo, useRef, useState } from 'react';
import { useSystemServiceInfo } from '@attraccess/react-query-client';

interface Options {
  consecutiveErrorThreshold?: number;
  refetchIntervalMs?: number;
}

export function useReliableServerAvailability(options: Options = {}) {
  const { consecutiveErrorThreshold = 3, refetchIntervalMs = 5000 } = options;

  const [errorStreak, setErrorStreak] = useState(0);
  const mountedRef = useRef(true);

  const query = useSystemServiceInfo(undefined, {
    refetchInterval: refetchIntervalMs,
    retry: false,
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (query.isSuccess) {
      if (mountedRef.current) {
        setErrorStreak(0);
      }
      return;
    }
    if (query.isError) {
      if (mountedRef.current) {
        setErrorStreak((prev) => Math.min(prev + 1, consecutiveErrorThreshold));
      }
    }
  }, [query.isSuccess, query.isError, consecutiveErrorThreshold]);

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
