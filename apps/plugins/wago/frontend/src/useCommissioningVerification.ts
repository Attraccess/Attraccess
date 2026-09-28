import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getCommissioningVerification, type CommissioningSession } from './api';

/** Enrollment evidence is independent of configuration and physical qualification. */
export function useCommissioningVerification(session: Pick<CommissioningSession, 'id' | 'state'>) {
  const enabled = ['awaiting_verification', 'completed'].includes(session.state);
  const query = useQuery({
    queryKey: ['wago', 'commissioning-verification', session.id],
    queryFn: () => getCommissioningVerification(session.id),
    enabled,
    refetchInterval: 5000,
  });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  const stale = !!query.data && now - query.dataUpdatedAt > 15_000;
  const unavailable = query.isError || stale;
  const data = enabled && !unavailable ? query.data : undefined;
  const enrollmentComplete = !!(data?.controllerId && data.permanentConnection && data.enrollmentRevoked);
  return {
    data,
    unavailable,
    enrollmentComplete,
    runtimeVerified: enrollmentComplete && data?.configurationApplied === true && data.hardwareReadiness === 'ready',
  };
}
