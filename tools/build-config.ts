export const DEFAULT_PWA_MAX_CACHE_BYTES = 5 * 1024 * 1024;

export const resolvePwaMaxCacheBytes = (value?: number | string): number => {
  const parsed = typeof value === 'string' ? Number(value) : value;

  if (Number.isFinite(parsed) && parsed && parsed > 0) {
    return parsed;
  }

  return DEFAULT_PWA_MAX_CACHE_BYTES;
};
