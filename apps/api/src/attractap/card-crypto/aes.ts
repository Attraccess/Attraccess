import { createCipheriv, createDecipheriv } from 'node:crypto';

export const AES_BLOCK_SIZE = 16;
const BLOCK = AES_BLOCK_SIZE;

function ecbEncrypt(key: Buffer, block: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(block), cipher.final()]);
}

function shiftLeft(input: Buffer): Buffer {
  const out = Buffer.alloc(BLOCK);
  for (let i = 0; i < BLOCK; i++) {
    out[i] = ((input[i] << 1) & 0xff) | (i + 1 < BLOCK ? input[i + 1] >> 7 : 0);
  }
  return out;
}

/** XOR of two equally long buffers. */
export function xor(a: Buffer, b: Buffer): Buffer {
  if (a.length !== b.length) throw new Error('xor operands differ in length');
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out;
}

/** AES-128-CMAC (RFC 4493), 16 byte output. */
export function aesCmac(key: Buffer, message: Buffer): Buffer {
  const l = ecbEncrypt(key, Buffer.alloc(BLOCK));
  const k1 = shiftLeft(l);
  if (l[0] & 0x80) k1[BLOCK - 1] ^= 0x87;
  const k2 = shiftLeft(k1);
  if (k1[0] & 0x80) k2[BLOCK - 1] ^= 0x87;

  const blocks = Math.max(1, Math.ceil(message.length / BLOCK));
  const complete = message.length > 0 && message.length % BLOCK === 0;
  let last = message.subarray((blocks - 1) * BLOCK);
  if (complete) {
    last = xor(last, k1);
  } else {
    const padded = Buffer.alloc(BLOCK);
    last.copy(padded);
    padded[last.length] = 0x80;
    last = xor(padded, k2);
  }

  let x: Buffer = Buffer.alloc(BLOCK);
  for (let i = 0; i < blocks - 1; i++) {
    x = ecbEncrypt(key, xor(x, message.subarray(i * BLOCK, (i + 1) * BLOCK)));
  }
  return ecbEncrypt(key, xor(x, last));
}

/** AES-128-CBC without padding; input must be block aligned. Throws otherwise. */
export function cbcEncrypt(key: Buffer, iv: Buffer, data: Buffer): Buffer {
  if (data.length % BLOCK !== 0) throw new Error('input is not block aligned');
  const cipher = createCipheriv('aes-128-cbc', key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

export function cbcDecrypt(key: Buffer, iv: Buffer, data: Buffer): Buffer {
  if (data.length % BLOCK !== 0) throw new Error('input is not block aligned');
  const decipher = createDecipheriv('aes-128-cbc', key, iv);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}
