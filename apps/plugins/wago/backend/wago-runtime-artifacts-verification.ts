import type { FileHandle } from 'node:fs/promises';
import { isCc100HardwareProfile, type Cc100HardwareProfile } from '../shared/hardware-profile';

export const WAGO_RUNTIME_MAX_BYTES = 512 * 1024 * 1024;
export interface RuntimeArtifactManifest {
  readonly schemaVersion: 1;
  readonly runtime: 'attraccess-wago-cc100';
  readonly runtimeVersion: string;
  readonly protocolVersion: '1.0.0';
  readonly image: string;
  readonly hardware: Readonly<{
    model: '751-9301';
    platform: 'linux/arm/v7';
    firmwareBaseline: '31';
    profile: Cc100HardwareProfile;
  }>;
}

function invalid(): never {
  throw new Error('Invalid runtime artifact');
}
export function validateRuntimeManifest(value: unknown): RuntimeArtifactManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const data = value as Record<string, unknown>;
  const hardware = data.hardware as Record<string, unknown> | undefined;
  if (
    Object.keys(data).sort().join(',') !== 'hardware,image,protocolVersion,runtime,runtimeVersion,schemaVersion' ||
    data.schemaVersion !== 1 ||
    data.runtime !== 'attraccess-wago-cc100' ||
    data.protocolVersion !== '1.0.0' ||
    typeof data.runtimeVersion !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(data.runtimeVersion) ||
    data.runtimeVersion.length > 80 ||
    typeof data.image !== 'string' ||
    data.image.length > 300 ||
    !/^ghcr\.io\/attraccess\/wago-cc100-runtime(?::[A-Za-z0-9_.-]+)?@sha256:[a-f0-9]{64}$/.test(data.image) ||
    !hardware ||
    Object.keys(hardware).sort().join(',') !== 'firmwareBaseline,model,platform,profile' ||
    hardware.model !== '751-9301' ||
    hardware.platform !== 'linux/arm/v7' ||
    hardware.firmwareBaseline !== '31' ||
    !isCc100HardwareProfile(hardware.profile)
  )
    invalid();
  return Object.freeze({
    schemaVersion: 1,
    runtime: data.runtime,
    runtimeVersion: data.runtimeVersion,
    protocolVersion: data.protocolVersion,
    image: data.image,
    hardware: Object.freeze({
      model: hardware.model,
      platform: hardware.platform,
      firmwareBaseline: hardware.firmwareBaseline,
      profile: hardware.profile,
    }),
  });
}

/** Strict plain USTAR: no extraction, extensions, links, duplicate paths, or special files. */
export async function inspectRuntimeTar(file: FileHandle, bytes: number): Promise<RuntimeArtifactManifest> {
  const members = new Map<string, Buffer>();
  let offset = 0;
  let terminated = false;
  async function read(length: number, position: number) {
    const data = Buffer.alloc(length);
    if ((await file.read(data, 0, length, position)).bytesRead !== length) invalid();
    return data;
  }
  function octal(data: Buffer) {
    const text = data.toString('ascii').replace(/\0.*$/, '').trim();
    if (!/^[0-7]+$/.test(text)) invalid();
    return parseInt(text, 8);
  }
  if (bytes % 512) invalid();
  while (offset < bytes) {
    const header = await read(512, offset);
    offset += 512;
    if (header.every((byte) => byte === 0)) {
      if (offset + 512 > bytes) invalid();
      for (let position = offset; position < bytes; position += 512)
        if (!(await read(512, position)).every((byte) => byte === 0)) invalid();
      terminated = true;
      break;
    }
    const expected = octal(header.subarray(148, 156));
    const actual = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (
      expected !== actual ||
      header.subarray(257, 263).toString() !== 'ustar\0' ||
      header.subarray(263, 265).toString() !== '00' ||
      ![0, 48].includes(header[156]) ||
      header.subarray(157, 257).some(Boolean) ||
      header.subarray(345, 500).some(Boolean)
    )
      invalid();
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, '');
    if (!['image.tar', 'image-reference', 'manifest.json'].includes(name) || members.has(name)) invalid();
    const length = octal(header.subarray(124, 136));
    if (!length || offset + Math.ceil(length / 512) * 512 > bytes || (name !== 'image.tar' && length > 16384))
      invalid();
    members.set(name, name === 'image.tar' ? Buffer.alloc(0) : await read(length, offset));
    offset += Math.ceil(length / 512) * 512;
  }
  if (!terminated || members.size !== 3) invalid();
  const manifestBytes = members.get('manifest.json');
  if (!manifestBytes) invalid();
  const manifest = validateRuntimeManifest(JSON.parse(manifestBytes.toString('utf8')));
  if (members.get('image-reference')?.toString('utf8') !== `${manifest.image}\n`) invalid();
  return manifest;
}
