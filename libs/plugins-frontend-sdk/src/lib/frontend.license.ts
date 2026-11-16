import { useCallback, useEffect, useState } from 'react';
import { createPluginApiClient } from './frontend.api-client';

/** The license of the Attraccess installation, as `GET /api/license-data` returns it. */
export interface PluginLicenseData {
  /** Whether the license is valid. */
  valid: boolean;
  /** Why the license is not valid. */
  reason?: string;
  /** Modules the license grants. The non-profit key grants core modules only, never plugin modules. */
  modules: string[];
  /** Usage limits by name. Unlimited values arrive as `null` in JSON. */
  usageLimits: Record<string, number | null>;
  /** The installation uses the free non-profit key. */
  isNonProfit: boolean;
}

/**
 * Fetches the current license of the installation. Needs a logged-in user. Rejects with a `PluginApiError` on
 * failure (for example when the user is signed out) or when the license service cannot check it.
 */
export function fetchPluginLicense(): Promise<PluginLicenseData> {
  return createPluginApiClient().request<PluginLicenseData>('/api/license-data');
}

export interface UsePluginLicenseResult {
  /** The license, or `null` while loading or when it could not be read. */
  license: PluginLicenseData | null;
  isLoading: boolean;
  error: Error | null;
  /** True only when the license is valid and grants the module. False while loading or when unknown. */
  hasModule(module: string): boolean;
  refetch(): Promise<void>;
}

/**
 * Lets a plugin frontend decide how much to offer based on the license. The host does not hide a plugin's UI for a
 * missing license (except for plugins that declare a requirement in plugin.json, which are not loaded at all), so
 * a plugin that wants to degrade gracefully checks here.
 */
export function usePluginLicense(): UsePluginLicenseResult {
  const [license, setLicense] = useState<PluginLicenseData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (isCurrent: () => boolean) => {
    setIsLoading(true);
    try {
      const data = await fetchPluginLicense();
      if (!isCurrent()) return;
      setLicense(data);
      setError(null);
    } catch (caught) {
      if (!isCurrent()) return;
      setLicense(null);
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let current = true;
    void load(() => current);
    return () => {
      current = false;
    };
  }, [load]);

  return {
    license,
    isLoading,
    error,
    hasModule: (module) => Boolean(license?.valid && license.modules.includes(module)),
    refetch: () => load(() => true),
  };
}
