import { crc32 } from 'zlib';

/** A Unix `mode` (e.g. `0o120777` for a symlink) is stored in the entry's external attributes. */
export type ZipFiles = Record<string, string | Buffer | { data: string | Buffer; mode: number }>;

interface ZipEntry {
  name: string;
  data: Buffer;
  mode?: number;
}

const toBuffer = (content: string | Buffer) => (Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'));

export function makeZip(files: ZipFiles): Buffer {
  const entries: ZipEntry[] = Object.entries(files).map(([name, content]) =>
    typeof content === 'string' || Buffer.isBuffer(content)
      ? { name, data: toBuffer(content) }
      : { name, data: toBuffer(content.data), mode: content.mode },
  );

  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data) >>> 0;
    const size = entry.data.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18);
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    locals.push(localHeader, nameBuf, entry.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    // "Version made by" 3 = Unix, so readers take the external attributes as st_mode.
    centralHeader.writeUInt16LE(entry.mode === undefined ? 20 : (3 << 8) | 20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(((entry.mode ?? 0) << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centrals.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + entry.data.length;
  }

  const localBuf = Buffer.concat(locals);
  const centralBuf = Buffer.concat(centrals);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(localBuf.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localBuf, centralBuf, end]);
}

export function zipFileUpload(files: ZipFiles, overrides: Record<string, unknown> = {}) {
  const buffer = makeZip(files);
  return {
    fieldname: 'pluginZip',
    originalname: 'plugin.zip',
    encoding: '7bit',
    mimetype: 'application/zip',
    buffer,
    size: buffer.length,
    ...overrides,
  } as never;
}
