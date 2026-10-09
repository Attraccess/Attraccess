// mDNS discovery of `_shelly._tcp` services (ATT-497).
//
// Hand-rolled over node:dgram rather than pulling in an mDNS dependency: we send
// one PTR query and only need the A records back, which is a few dozen lines of
// buffer walking — and plugin backends are bundled, so every dependency is
// shipped inside the artifact.
//
// Two deliberate simplifications:
//  * We ask for a *unicast* response (the QU bit in the question's class) and
//    bind an ephemeral port instead of joining 224.0.0.251 on port 5353. That
//    avoids fighting a host mDNS responder (avahi/Bonjour) for the well-known
//    port. Ceiling: a responder that ignores QU and answers only to multicast is
//    missed — the subnet scan is the fallback for that, and for Docker bridge
//    networking where multicast does not reach the LAN at all.
//  * We do not decode record *names*. If the response mentions `_shelly` at all,
//    we take every A record in it as a candidate. Candidates are confirmed by an
//    actual `GET /shelly` probe afterwards, so a false positive costs one HTTP
//    request and is then dropped.
import { createSocket } from 'node:dgram';

const MDNS_ADDRESS = '224.0.0.251';
const MDNS_PORT = 5353;
const SERVICE = '_shelly._tcp.local';
const DEFAULT_TIMEOUT_MS = 2000;

const TYPE_PTR = 12;
const TYPE_A = 1;
/** IN class with the top ("unicast response requested") bit set. */
const QCLASS_IN_UNICAST = 0x8001;

/** Builds a single-question DNS query packet for `SERVICE` PTR records. */
export function buildQuery(): Buffer {
  const labels = SERVICE.split('.');
  const nameLength = labels.reduce((total, label) => total + 1 + label.length, 0) + 1;
  const packet = Buffer.alloc(12 + nameLength + 4);

  // Header: id 0 (mDNS ignores it), flags 0 (standard query), 1 question.
  packet.writeUInt16BE(1, 4);

  let offset = 12;
  for (const label of labels) {
    packet.writeUInt8(label.length, offset);
    offset += 1;
    offset += packet.write(label, offset, 'ascii');
  }
  packet.writeUInt8(0, offset);
  offset += 1;
  packet.writeUInt16BE(TYPE_PTR, offset);
  packet.writeUInt16BE(QCLASS_IN_UNICAST, offset + 2);
  return packet;
}

/** Advances past a DNS name, handling compression pointers. */
function skipName(packet: Buffer, start: number): number {
  let offset = start;
  while (offset < packet.length) {
    const length = packet[offset];
    if (length === 0) return offset + 1;
    if ((length & 0xc0) === 0xc0) return offset + 2; // pointer — always terminal
    offset += length + 1;
  }
  return packet.length;
}

/**
 * Extracts the IPv4 addresses advertised by a `_shelly._tcp` mDNS response.
 * Returns an empty array for responses that do not mention the service or that
 * are truncated/malformed — a bad packet must never break discovery.
 */
export function parseShellyAddresses(packet: Buffer): string[] {
  // latin1 keeps a 1:1 byte↔char mapping, so a label boundary can't hide the match.
  if (!packet.toString('latin1').includes('_shelly')) return [];
  if (packet.length < 12) return [];

  const counts = [4, 6, 8, 10].map((at) => packet.readUInt16BE(at));
  const [questions, answers, authorities, additionals] = counts;

  let offset = 12;
  for (let i = 0; i < questions; i++) {
    offset = skipName(packet, offset) + 4; // qtype + qclass
  }

  const addresses: string[] = [];
  const records = answers + authorities + additionals;
  for (let i = 0; i < records && offset + 10 <= packet.length; i++) {
    offset = skipName(packet, offset);
    if (offset + 10 > packet.length) break;
    const type = packet.readUInt16BE(offset);
    const rdLength = packet.readUInt16BE(offset + 8);
    offset += 10;
    if (offset + rdLength > packet.length) break;
    if (type === TYPE_A && rdLength === 4) {
      addresses.push([packet[offset], packet[offset + 1], packet[offset + 2], packet[offset + 3]].join('.'));
    }
    offset += rdLength;
  }
  return [...new Set(addresses)];
}

/**
 * Sends one `_shelly._tcp` mDNS query and collects the IPv4 addresses that
 * answer within `timeoutMs`. Best-effort by contract: a container without
 * multicast, a blocked socket or a garbled reply all yield `[]` rather than an
 * error, because the subnet scan still has to run either way.
 */
export function discoverViaMdns(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string[]> {
  return new Promise((resolve) => {
    const found = new Set<string>();
    let socket: ReturnType<typeof createSocket>;
    try {
      socket = createSocket({ type: 'udp4', reuseAddr: true });
    } catch {
      resolve([]);
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // Already closed — nothing to do.
      }
      resolve([...found]);
    };

    const timer = setTimeout(finish, timeoutMs);
    // Do not keep the process (or a Jest run) alive just to wait out the query.
    timer.unref?.();

    socket.on('error', finish);
    socket.on('message', (message) => {
      for (const address of parseShellyAddresses(message)) found.add(address);
    });
    socket.on('listening', () => {
      try {
        socket.setMulticastTTL(255);
        socket.send(buildQuery(), MDNS_PORT, MDNS_ADDRESS);
      } catch {
        finish();
      }
    });

    try {
      socket.bind(0);
    } catch {
      finish();
    }
  });
}
