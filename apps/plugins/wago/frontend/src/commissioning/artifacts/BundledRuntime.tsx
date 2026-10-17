import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import { useWagoTranslations } from '../../i18n';

export interface RuntimeArtifactInfo {
  digest: string;
  bytes: number;
  image: string;
  manifest: {
    schemaVersion: 1;
    runtime: string;
    runtimeVersion: string;
    protocolVersion: string;
    image: string;
    hardware: { model: string; platform: string; firmwareBaseline: string; profile: string };
  };
}
interface BundledRuntimeProps {
  compact?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onSelectionChange?: (artifact: RuntimeArtifactInfo | null) => void;
  disabled?: boolean;
}
const api = createPluginApiClient('/api/wago/runtime-artifacts');

export function BundledRuntime({
  onBusyChange,
  onSelectionChange,
  disabled = false,
  compact = false,
}: BundledRuntimeProps) {
  const { t } = useWagoTranslations();
  const [current, setCurrent] = useState<RuntimeArtifactInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const busyCallback = useRef(onBusyChange);
  useEffect(() => {
    busyCallback.current = onBusyChange;
  }, [onBusyChange]);
  useEffect(() => {
    onSelectionChange?.(current);
  }, [current, onSelectionChange]);
  useEffect(() => {
    onBusyChange?.(loading);
  }, [loading, onBusyChange]);
  useEffect(() => () => busyCallback.current?.(false), []);
  useEffect(() => {
    const abort = new AbortController();
    api
      .request<RuntimeArtifactInfo | null>('/current', { signal: abort.signal })
      .then((active) => {
        if (abort.signal.aborted) return;
        setCurrent(active);
        setLoadFailed(false);
      })
      .catch(() => {
        if (abort.signal.aborted) return;
        setCurrent(null);
        setLoadFailed(true);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [loadAttempt]);
  return (
    <section className="wg:space-y-3" aria-label={t('artifacts.title')}>
      {!compact && (
        <header>
          <h3>{t('artifacts.title')}</h3>
          <p>{t('artifacts.description')}</p>
        </header>
      )}
      {loading ? (
        <p>{t('artifacts.loading')}</p>
      ) : loadFailed ? (
        <p role="alert">{t('artifacts.loadError')}</p>
      ) : current ? (
        <>
          <p className="wg:break-words">
            {t('artifacts.selected', {
              version: current.manifest.runtimeVersion,
              model: current.manifest.hardware.model,
              firmware: current.manifest.hardware.firmwareBaseline,
              size: Math.ceil(current.bytes / 1024 / 1024),
            })}
          </p>
          {!compact && (
            <details className="wg:min-w-0 wg:max-w-full">
              <summary>{t('artifacts.details')}</summary>
              <p className="wg:break-all">{current.image}</p>
              <p className="wg:break-all">SHA-256: {current.digest}</p>
            </details>
          )}
        </>
      ) : (
        <p role="alert">{t('artifacts.required')}</p>
      )}
      {!loading && (loadFailed || !current) && (
        <Button
          variant="secondary"
          isDisabled={disabled}
          onPress={() => {
            setLoading(true);
            setLoadFailed(false);
            setLoadAttempt((attempt) => attempt + 1);
          }}
        >
          {t('artifacts.retry')}
        </Button>
      )}
    </section>
  );
}
