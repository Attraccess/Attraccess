export const normalizeMac = (mac?: string): string | null => {
  if (!mac) {
    return null;
  }
  const normalized = mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

export const parseHolyiotBatteryPercentFromHex = (dataHex: string): number | null => {
  const bytes = hexToBytes(dataHex);
  if (!bytes) {
    console.warn(`Invalid hex string for HolyIOT battery percent: ${dataHex}`);
    return null;
  }

  let offset = 0;
  while (offset < bytes.length) {
    const length = bytes[offset];
    if (length === 0) {
      break;
    }
    const nextOffset = offset + length + 1;
    if (nextOffset > bytes.length || offset + 1 >= bytes.length) {
      break;
    }
    const type = bytes[offset + 1];
    if (type === 0x16) {
      const start = offset + 2;
      const end = offset + 1 + length;
      if (end - start + 1 >= 3) {
        const uuid = bytes[start] | (bytes[start + 1] << 8);
        if (uuid === 0x5242) {
          const payloadStart = start + 2;
          if (payloadStart + 1 <= end && bytes[payloadStart] === 0x41) {
            return bytes[payloadStart + 1];
          }
        }
      }
    }
    offset = nextOffset;
  }

  console.warn(`No battery percent found for HolyIOT beacon: ${dataHex}`);
  return null;
};

const hexToBytes = (hex: string): number[] | null => {
  const cleaned = hex.trim().replace(/\s+/g, '');
  if (!cleaned || cleaned.length % 2 !== 0 || /[^a-fA-F0-9]/.test(cleaned)) {
    return null;
  }
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes.push(parseInt(cleaned.slice(i, i + 2), 16));
  }
  return bytes;
};
