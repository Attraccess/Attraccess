import { validRange } from 'semver';

/** URLs may carry credentials, query tokens or private paths: record the origin only. */
export function safeAuditOrigin(value: string): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.origin : 'custom-source';
  } catch {
    return 'custom-source';
  }
}

export function safeRequestedSpec(value: string): string {
  if (value === 'custom-source') return value;
  if (typeof value !== 'string' || value.length > 100) return 'custom-source';
  return validRange(value) || /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(value) ? value : 'custom-source';
}

export function safeAuditHost(value: string): string {
  if (!value || value === 'configured') return value;
  return /^[a-zA-Z0-9_.:[\]-]{1,253}$/.test(value) ? value : 'configured';
}

export function safeAuditSender(value: string): string {
  const address = value.match(/(?:<|^)([^<>\s]+@[^<>\s]+)(?:>|$)/)?.[1];
  return address && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+$/.test(address)
    ? address
    : value
      ? 'configured'
      : '';
}
