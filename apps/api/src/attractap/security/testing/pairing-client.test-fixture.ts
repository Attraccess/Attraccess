import { webcrypto } from 'crypto';
import { WebSocket } from 'ws';
import { PAIRING_SUBPROTOCOL } from '../session-framing';

export function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

export async function readerKey() {
  const keys = (await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  return Buffer.from(await webcrypto.subtle.exportKey('spki', keys.publicKey as unknown as webcrypto.CryptoKey));
}

export class PairingClient {
  public readonly messages: Array<Record<string, unknown>> = [];
  public readonly ws: WebSocket;
  public constructor(url: string, headers: Record<string, string> = {}) {
    this.ws = new WebSocket(url, PAIRING_SUBPROTOCOL, { headers });
    this.ws.on('message', (data: Buffer) => this.messages.push(JSON.parse(data.toString())));
    this.ws.on('error', () => undefined);
  }
  public opened() {
    return new Promise<void>((resolve) => this.ws.once('open', () => resolve()));
  }
  public send(message: Record<string, unknown>) {
    this.ws.send(JSON.stringify(message));
  }
  public async next(type: string) {
    for (let i = 0; i < 100; i++) {
      const index = this.messages.findIndex((m) => m['type'] === type);
      if (index >= 0) return this.messages.splice(index, 1)[0];
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`no ${type} message`);
  }
}
