import { useEffect, useRef, useState } from 'react';
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import { ManagementSecurityStatus } from './ManagementSecurityStatus';
import type { ManagementPublicStatus } from '../../backend/wago-management.types';

const api = createPluginApiClient('/api/wago/commissioning/sessions');

export function CommissioningSecurityPanel({ sessionId, controllerId }: { sessionId: number; controllerId: number }) {
  const [status, setStatus] = useState<ManagementPublicStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    const abort = new AbortController();
    void api
      .request<ManagementPublicStatus | null>(`/${sessionId}/management`, { signal: abort.signal })
      .then((value) => {
        if (generation.current === current) setStatus(value);
      })
      .catch(() => {
        if (!abort.signal.aborted) setLoadError(true);
      });
    return () => {
      generation.current++;
      abort.abort();
    };
  }, [sessionId]);

  async function request(action: string, body: unknown) {
    const current = ++generation.current;
    const value = await api.request<ManagementPublicStatus>(`/${sessionId}/management/${action}`, {
      method: 'POST',
      body,
    });
    if (generation.current === current) {
      setStatus(value);
      setLoadError(false);
    }
    return value;
  }
  return (
    <div className="wg:space-y-3">
      {loadError && (
        <p role="alert">Saved management status could not be loaded. Close and reopen this panel to retry.</p>
      )}
      <ManagementSecurityStatus
        controllerId={controllerId}
        status={status}
        onInspect={(temporarySsh) => request('inspect', { temporarySsh })}
        onReview={(input) => request('review', input)}
        onApply={(input) => request('apply', input)}
        onRecover={(input) => request('recover', input)}
      />
    </div>
  );
}
