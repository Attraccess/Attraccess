import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';

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
  const [current, setCurrent] = useState<RuntimeArtifactInfo | null>(null);
  useEffect(() => {
    onSelectionChange?.(current);
  }, [current, onSelectionChange]);
  const [artifacts, setArtifacts] = useState<RuntimeArtifactInfo[]>([]);
  const [files, setFiles] = useState<Partial<Record<'bundle' | 'checksum' | 'signature', File>>>({});
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
        setError('Runtime releases could not be loaded. Check your connection and retry.');
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [loadAttempt]);
  async function importRelease() {
    if (
      !files.bundle ||
      !files.checksum ||
      !files.signature ||
      disabled ||
      loading ||
      loadFailed ||
      uploadAbort.current
    )
      return;
    if (files.bundle.size > maxBytes || files.checksum.size > 4096 || files.signature.size > 16384) {
      setError('The runtime tar must be at most 512 MiB, checksum 4 KiB, and signature 16 KiB.');
      return;
    }
    setBusy(true);
    setError('');
    setStatus('Uploading and verifying the signed release…');
    const abort = new AbortController();
    uploadAbort.current = abort;
    let failureMessage = 'Import could not be completed. Check your connection and retry with the selected files.';
    try {
      const body = new FormData();
      body.append('bundle', files.bundle);
      body.append('checksum', files.checksum);
      body.append('signature', files.signature);
      const response = await api.fetch('/import', { method: 'POST', body, signal: abort.signal });
      if (abort.signal.aborted) return;
      if (!response.ok) {
        failureMessage =
          response.status === 403
            ? 'Administrator access is required.'
            : response.status === 409
              ? 'Another upload is in progress. Try again shortly.'
              : 'Import failed. Check that all three files belong to the same signed release and try again.';
        throw new Error('Import rejected');
      }
      const artifact: RuntimeArtifactInfo = await response.json();
      if (abort.signal.aborted) return;
      setCurrent(artifact);
      setArtifacts((previous) => [artifact, ...previous.filter((entry) => entry.digest !== artifact.digest)]);
      setFiles({});
      form.current?.reset();
      setStatus('Release verified and selected for future commissioning. Existing deliveries retain their release.');
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
    <section className="wg:space-y-3" aria-label="CC100 runtime release">
      <header>
        <h3>CC100 runtime release</h3>
        <p>
          Download the signed WAGO runtime bundle, extract its archive, then select the three release files. No server
          paths or signing keys are needed.
        </p>
      </header>
      <div className="wg:space-y-3">
        <p>
          <a
            href="https://github.com/Attraccess/Attraccess/actions/workflows/wago-cc100-runtime.yml"
            target="_blank"
            rel="noreferrer"
          >
            Official signed runtime build artifacts
          </a>
          . Your software distributor can also provide these files. Only signed builds are importable.
        </p>
        {loading ? (
          <p>Loading releases…</p>
        ) : loadFailed ? (
          <p>Runtime releases are unavailable.</p>
        ) : current ? (
          <p className="wg:break-words">
            Selected: {current.manifest.runtimeVersion} · WAGO {current.manifest.hardware.model} · firmware{' '}
            {current.manifest.hardware.firmwareBaseline} · {Math.ceil(current.bytes / 1024 / 1024)} MiB
          </p>
        ) : (
          <p>Import a release before commissioning a controller.</p>
        )}
        {current && (
          <details className="wg:min-w-0 wg:max-w-full">
            <summary>Release details</summary>
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
            <legend>Signed release files</legend>
            {(
              [
                ['bundle', 'Runtime bundle (.tar)', '.tar'],
                ['checksum', 'Checksum (.sha256)', '.sha256'],
                ['signature', 'Signature (.sig)', '.sig'],
              ] as const
            ).map(([field, label, accept]) => (
              <label key={field}>
                {label}
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
              isDisabled={
                disabled || busy || loading || loadFailed || !files.bundle || !files.checksum || !files.signature
              }
            >
              {busy ? 'Verifying release…' : 'Import and select release'}
            </Button>
          </fieldset>
        </form>
        <p role="status" aria-live="polite">
          {status}
        </p>
        {error && <p role="alert">{error}</p>}
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
            Retry loading releases
          </Button>
        )}
        {artifacts.length > 1 && (
          <details>
            <summary>Retained releases ({artifacts.length})</summary>
            <ul>
              {artifacts.map((artifact) => (
                <li key={artifact.digest}>
                  {artifact.manifest.runtimeVersion} · {artifact.digest.slice(0, 12)}
                  {artifact.digest === current?.digest ? ' · selected' : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
