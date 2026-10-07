import { useWagoTranslations } from './i18n';
import { useEffect } from 'react';
import { useState } from 'react';

export function DiagnosticsFailure() {
  const { t } = useWagoTranslations();
  return <p role="alert">{t('diagnostics.boundaryError')}</p>;
}
export function pollFresh(receivedAt: number, now: number) {
  return receivedAt > 0 && now - receivedAt <= 15_000;
}

export function useDiagnosticsClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
