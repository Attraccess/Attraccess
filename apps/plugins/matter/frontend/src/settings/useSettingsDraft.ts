import { useState } from 'react';
import type { ConnectionSettings, SettingsInput } from '../api';
import { validateCa, validateCredential, validateUrl, type ValidationKey } from '../settingsValidation';

/** The URL as the backend stores it (origin and path without trailing slashes), so a respelling is no change. */
function normalizedUrl(value: string): string {
  try {
    const parsed = new URL(value.trim());
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return value.trim();
  }
}

export interface SettingsDraft {
  /** The settings this draft was loaded from. */
  base: ConnectionSettings;
  url: string;
  setUrl: (value: string) => void;
  credential: string;
  setCredential: (value: string) => void;
  /** The user asked to replace the stored token. */
  replacing: boolean;
  setReplacing: (value: boolean) => void;
  ca: string;
  setCa: (value: string) => void;
  caCleared: boolean;
  setCaCleared: (value: boolean) => void;
  /** The URL or the CA changed while a token is stored, so the token must be entered again. */
  endpointChanged: boolean;
  needsCredential: boolean;
  /** Another administrator saved different settings than the ones this draft started from. */
  changedElsewhere: boolean;
  /** The user changed something. */
  dirty: boolean;
  urlError: ValidationKey;
  credentialError: ValidationKey;
  caError: ValidationKey;
  canSave: boolean;
  /** Replaces the draft with these settings. */
  load: (settings: ConnectionSettings) => void;
  /** The request body for what changed. */
  input: () => SettingsInput;
}

/**
 * The editable draft of the connection settings. It starts from `settings` (its `base`) and compares with them to know
 * what changed. While this form's own save or removal runs (`busy`), the page may already hold the new settings: that is
 * no foreign change. An untouched draft follows the server; one with edits keeps them and reports `changedElsewhere`.
 */
export function useSettingsDraft(settings: ConnectionSettings, busy: boolean): SettingsDraft {
  const [base, setBase] = useState(settings);
  const [url, setUrl] = useState(settings.url ?? '');
  const [replacing, setReplacing] = useState(!settings.credentialConfigured);
  const [credential, setCredential] = useState('');
  const [ca, setCa] = useState(settings.caCertificate ?? '');
  const [caCleared, setCaCleared] = useState(false);

  const load = (next: ConnectionSettings) => {
    setBase(next);
    setUrl(next.url ?? '');
    setCa(next.caCertificate ?? '');
    setCaCleared(false);
    setCredential('');
    setReplacing(!next.credentialConfigured);
  };

  const caChanged = caCleared || ca.trim() !== (base.caCertificate ?? '').trim();
  const urlChanged = url.trim() !== (base.url ?? '');
  const dirty = urlChanged || caChanged || credential !== '' || (replacing && base.credentialConfigured);
  const changedElsewhere = !busy && (settings.updatedAt !== base.updatedAt || settings.url !== base.url);
  // An untouched draft follows the server; adopted during render, so there is no frame with stale values.
  if (changedElsewhere && !dirty) load(settings);

  const urlMoved = base.url !== null && normalizedUrl(url) !== normalizedUrl(base.url);
  const endpointChanged = base.credentialConfigured && (caChanged || urlMoved);
  const needsCredential = replacing || endpointChanged;
  const urlError = validateUrl(url);
  const credentialError = needsCredential ? validateCredential(credential) : null;
  const caError = caCleared ? null : validateCa(ca);
  const hasCredential = !needsCredential || credential !== '';
  const valid = !urlError && !credentialError && !caError;
  const canSave = url.trim() !== '' && hasCredential && valid && !changedElsewhere && !busy;

  const input = (): SettingsInput => {
    const body: SettingsInput = { url: url.trim() };
    if (needsCredential) body.credential = credential;
    if (caChanged) body.caCertificate = ca.trim() === '' || caCleared ? null : ca.trim();
    return body;
  };

  return {
    base,
    url,
    setUrl,
    credential,
    setCredential,
    replacing,
    setReplacing,
    ca,
    setCa,
    caCleared,
    setCaCleared,
    endpointChanged,
    needsCredential,
    changedElsewhere,
    dirty,
    urlError,
    credentialError,
    caError,
    canSave,
    load,
    input,
  };
}
