import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import { useWagoTranslations } from './i18n';

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
export interface RuntimeArtifactImportProps {
  /** Called after verification and atomic activation, so commissioning support can refresh. */
  onImported?: (artifact: RuntimeArtifactInfo) => void;
  /** Includes initial catalog loading, retries, and upload verification. */
  onBusyChange?: (busy: boolean) => void;
  onSelectionChange?: (artifact: RuntimeArtifactInfo | null) => void;
  disabled?: boolean;
}
const api = createPluginApiClient('/api/wago/runtime-artifacts');
const maxBytes = 512 * 1024 * 1024;

/** Standalone admin panel; uses the host API origin and authenticated session automatically. */
export function RuntimeArtifactImport({
  onImported,
  onBusyChange,
  onSelectionChange,
  disabled = false,
}: RuntimeArtifactImportProps) {
  const { t } = useWagoTranslations();
  const [current, setCurrent] = useState<RuntimeArtifactInfo | null>(null);
  useEffect(() => {
    onSelectionChange?.(current);
  }, [current, onSelectionChange]);
  const [artifacts, setArtifacts] = useState<RuntimeArtifactInfo[]>([]);
  const [files, setFiles] = useState<Partial<Record<'bundle' | 'checksum', File>>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const busyCallback = useRef(onBusyChange);
  useEffect(() => {
    busyCallback.current = onBusyChange;
  }, [onBusyChange]);
  useEffect(() => {
    onBusyChange?.(loading || busy);
  }, [loading, busy, onBusyChange]);
  useEffect(
    () => () => {
      uploadAbort.current?.abort();
      busyCallback.current?.(false);
    },
    [],
  );
  useEffect(() => {
    const abort = new AbortController();
    Promise.all([
      api.request<RuntimeArtifactInfo | null>('/current', { signal: abort.signal }),
      api.request<RuntimeArtifactInfo[]>('', { signal: abort.signal }),
    ])
      .then(([active, entries]) => {
        if (abort.signal.aborted) return;
        setCurrent(active);
        setArtifacts(entries);
        setLoadFailed(false);
      })
      .catch(() => {
        if (abort.signal.aborted) return;
        setLoadFailed(true);
        setError('artifacts.loadError');
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [loadAttempt]);
  async function importRelease() {
    if (!files.bundle || !files.checksum || disabled || loading || loadFailed || uploadAbort.current) return;
    if (files.bundle.size > maxBytes || files.checksum.size > 4096) {
      setError('artifacts.sizeError');
      return;
    }
    setBusy(true);
    setError('');
    setStatus('artifacts.uploading');
    const abort = new AbortController();
    uploadAbort.current = abort;
    let failureMessage = 'artifacts.importError';
    try {
      const body = new FormData();
      body.append('bundle', files.bundle);
      body.append('checksum', files.checksum);
      const response = await api.fetch('/import', { method: 'POST', body, signal: abort.signal });
      if (abort.signal.aborted) return;
      if (!response.ok) {
        failureMessage =
          response.status === 403
            ? 'artifacts.adminRequired'
            : response.status === 409
              ? 'artifacts.uploadBusy'
              : 'artifacts.invalid';
        throw new Error('Import rejected');
      }
      const artifact: RuntimeArtifactInfo = await response.json();
      if (abort.signal.aborted) return;
      setCurrent(artifact);
      setArtifacts((previous) => [artifact, ...previous.filter((entry) => entry.digest !== artifact.digest)]);
      setFiles({});
      form.current?.reset();
      setStatus('artifacts.success');
      onImported?.(artifact);
    } catch {
      if (abort.signal.aborted) return;
      setError(failureMessage);
      setStatus('');
    } finally {
      if (!abort.signal.aborted) {
        uploadAbort.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <section className="wg:space-y-3" aria-label={t('artifacts.title')}>
      <header>
        <h3>{t('artifacts.title')}</h3>
        <p>{t('artifacts.description')}</p>
      </header>
      <div className="wg:space-y-3">
        <p>
          <a
            href="https://github.com/Attraccess/Attraccess/actions/workflows/wago-cc100-runtime.yml"
            target="_blank"
            rel="noreferrer"
          >
            {t('artifacts.official')}
          </a>
          . {t('artifacts.sourceHint')}
        </p>
        {loading ? (
          <p>{t('artifacts.loading')}</p>
        ) : loadFailed ? (
          <p>{t('artifacts.unavailable')}</p>
        ) : current ? (
          <p className="wg:break-words">
            {t('artifacts.selected', {
              version: current.manifest.runtimeVersion,
              model: current.manifest.hardware.model,
              firmware: current.manifest.hardware.firmwareBaseline,
              size: Math.ceil(current.bytes / 1024 / 1024),
            })}
          </p>
        ) : (
          <p>{t('artifacts.required')}</p>
        )}
        {current && (
          <details className="wg:min-w-0 wg:max-w-full">
            <summary>{t('artifacts.details')}</summary>
            <p className="wg:break-all">{current.image}</p>
            <p className="wg:break-all">SHA-256: {current.digest}</p>
          </details>
        )}
        <form
          ref={form}
          onSubmit={(event) => {
            event.preventDefault();
            void importRelease();
          }}
        >
          <fieldset disabled={disabled || busy || loading || loadFailed} className="wg:flex wg:flex-col wg:gap-3">
            <legend>{t('artifacts.files')}</legend>
            {(
              [
                ['bundle', 'artifacts.bundle', '.tar'],
                ['checksum', 'artifacts.checksum', '.sha256'],
              ] as const
            ).map(([field, label, accept]) => (
              <label key={field}>
                {t(label)}
                <input
                  type="file"
                  accept={accept}
                  required
                  onChange={(event) => setFiles((previous) => ({ ...previous, [field]: event.target.files?.[0] }))}
                />
              </label>
            ))}
            <Button
              type="submit"
              isDisabled={disabled || busy || loading || loadFailed || !files.bundle || !files.checksum}
            >
              {t(busy ? 'artifacts.verifying' : 'artifacts.import')}
            </Button>
          </fieldset>
        </form>
        <p role="status" aria-live="polite">
          {status && t(status)}
        </p>
        {error && <p role="alert">{t(error)}</p>}
        {loadFailed && (
          <Button
            variant="secondary"
            isDisabled={loading || busy}
            onPress={() => {
              setLoading(true);
              setError('');
              setLoadAttempt((attempt) => attempt + 1);
            }}
          >
            {t('artifacts.retry')}
          </Button>
        )}
        {artifacts.length > 1 && (
          <details>
            <summary>{t('artifacts.retained', { count: artifacts.length })}</summary>
            <ul>
              {artifacts.map((artifact) => (
                <li key={artifact.digest}>
                  {artifact.manifest.runtimeVersion} · {artifact.digest.slice(0, 12)}
                  {artifact.digest === current?.digest ? t('artifacts.selectedSuffix') : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
