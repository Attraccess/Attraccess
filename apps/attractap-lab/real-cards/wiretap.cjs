'use strict';
// Plaintext tap for the lab API: `node -r wiretap.cjs dist/apps/api/main.js`.
//
// The reader's websocket carries TLS 1.3, so a proxy in front of the API only sees ciphertext. This
// preload patches TLSSocket inside the API process and records every framed application message
// ([type:u8][len:u32][json]) in both directions as JSON lines, with the card APDUs in full. It also
// runs the lab's "drop the link" fault: when a drop is armed for an APDU prefix, the reader's answer
// to the first matching CARD_APDU is swallowed and the connection is destroyed, so the card has
// executed the command (e.g. ChangeKey) but the server never hears about it.
//
// Environment:
//   WIRETAP_FILE   JSON-lines output (required)
//   WIRETAP_DROP   path of a control file; its content is an APDU hex prefix (e.g. "90c4"); the file
//                  is removed when the drop fires (one shot). Written by the kit before a step.
// It records everything the reader and the server exchange, including card APDUs: lab evidence only.
const fs = require('node:fs');
const tls = require('node:tls');

const FILE = process.env.WIRETAP_FILE;
const DROP = process.env.WIRETAP_DROP;
if (!FILE) throw new Error('WIRETAP_FILE is required');
const out = fs.openSync(FILE, 'a');
let nextId = 1;
const ids = new WeakMap();
const pendingApdu = new WeakMap(); // socket -> {seq, apdu}

function record(entry) {
  try {
    fs.writeSync(out, JSON.stringify({ t: Date.now() / 1000, ...entry }) + '\n');
  } catch (_) {
    /* tap must never break the API */
  }
}

function socketId(socket) {
  if (!ids.has(socket)) {
    ids.set(socket, nextId++);
    record({ ev: 'open', sock: ids.get(socket) });
    socket.once('close', () => record({ ev: 'close', sock: ids.get(socket) }));
  }
  return ids.get(socket);
}

class Decoder {
  constructor() { this.buf = Buffer.alloc(0); }
  push(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    const frames = [];
    while (this.buf.length >= 5) {
      const type = this.buf[0];
      const len = this.buf.readUInt32BE(1);
      if (len > 64 * 1024 + 16 || type < 1 || type > 4) { this.buf = Buffer.alloc(0); break; }
      if (this.buf.length < 5 + len) break;
      frames.push({ type, payload: this.buf.subarray(5, 5 + len) });
      this.buf = this.buf.subarray(5 + len);
    }
    return frames;
  }
}

const decoders = new WeakMap();
function framesOf(socket, dir, chunk) {
  const key = dir;
  let map = decoders.get(socket);
  if (!map) decoders.set(socket, (map = {}));
  const decoder = (map[key] ||= new Decoder());
  return decoder.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
}

function describe(sock, dir, frame) {
  if (frame.type !== 1) return { sock, dir, ftype: frame.type, bytes: frame.payload.length };
  let message;
  try { message = JSON.parse(frame.payload.toString('utf8')); } catch (_) { return { sock, dir, ftype: 1, unparsable: frame.payload.length }; }
  const data = (message && message.data) || {};
  return { sock, dir, type: data.type, payload: data.payload, bytes: frame.payload.length };
}

function armedPrefix() {
  if (!DROP) return null;
  try { return fs.readFileSync(DROP, 'utf8').trim().toLowerCase() || null; } catch (_) { return null; }
}

const originalWrite = tls.TLSSocket.prototype.write;
tls.TLSSocket.prototype.write = function (chunk, ...rest) {
  try {
    const sock = socketId(this);
    for (const frame of framesOf(this, 's2r', chunk)) {
      const entry = describe(sock, 's2r', frame);
      if (entry.type === 'CARD_APDU' && entry.payload) pendingApdu.set(this, { seq: entry.payload.seq, apdu: String(entry.payload.apdu).toLowerCase() });
      record(entry);
    }
  } catch (_) { /* ignore */ }
  return originalWrite.call(this, chunk, ...rest);
};

const originalOn = tls.TLSSocket.prototype.on;
function wrapData(socket, listener) {
  return function (chunk) {
    let drop = false;
    try {
      const sock = socketId(socket);
      for (const frame of framesOf(socket, 'r2s', chunk)) {
        const entry = describe(sock, 'r2s', frame);
        if (entry.type === 'CARD_APDU_RESPONSE' && entry.payload) {
          const pending = pendingApdu.get(socket);
          const prefix = armedPrefix();
          if (pending && prefix && pending.seq === entry.payload.seq && pending.apdu.startsWith(prefix)) {
            drop = true;
            entry.dropped = true;
            try { fs.unlinkSync(DROP); } catch (_) { /* already gone */ }
          }
        }
        record(entry);
      }
    } catch (_) { /* ignore */ }
    if (drop) {
      record({ ev: 'drop', sock: ids.get(socket) });
      socket.destroy();
      return undefined;
    }
    return listener.apply(this, arguments);
  };
}
tls.TLSSocket.prototype.on = function (event, listener) {
  if (event === 'data' && typeof listener === 'function') return originalOn.call(this, event, wrapData(this, listener));
  return originalOn.call(this, event, listener);
};
tls.TLSSocket.prototype.addListener = tls.TLSSocket.prototype.on;
record({ ev: 'wiretap-loaded', pid: process.pid });
