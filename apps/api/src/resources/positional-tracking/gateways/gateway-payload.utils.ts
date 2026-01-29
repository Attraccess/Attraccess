export const base64ToHex = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  try {
    const buffer = Buffer.from(value, 'base64');
    return buffer.length > 0 ? buffer.toString('hex') : null;
  } catch {
    return null;
  }
};

export const parseEpochSecondsOrMs = (timestamp?: number): Date | null => {
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  const normalized = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  return new Date(normalized);
};
