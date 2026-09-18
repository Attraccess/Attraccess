import { buildQuery, discoverViaMdns, parseShellyAddresses } from './mdns-discovery';

function encodeName(name: string): Buffer {
  const parts = name
    .split('.')
    .map((label) => Buffer.concat([Buffer.from([label.length]), Buffer.from(label, 'ascii')]));
  return Buffer.concat([...parts, Buffer.from([0])]);
}

/** A realistic mDNS answer: a PTR for the service plus a compressed-name A record. */
function shellyResponse(ip: number[], serviceName = '_shelly._tcp.local'): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0x8400, 2); // response, authoritative
  header.writeUInt16BE(1, 6); // answers
  header.writeUInt16BE(1, 10); // additionals

  const ptrName = encodeName(serviceName);
  const ptrData = encodeName(`shelly1.${serviceName}`);
  const ptrHead = Buffer.alloc(10);
  ptrHead.writeUInt16BE(12, 0); // PTR
  ptrHead.writeUInt16BE(1, 2); // IN
  ptrHead.writeUInt32BE(120, 4);
  ptrHead.writeUInt16BE(ptrData.length, 8);

  const aHead = Buffer.alloc(10);
  aHead.writeUInt16BE(1, 0); // A
  aHead.writeUInt16BE(1, 2);
  aHead.writeUInt32BE(120, 4);
  aHead.writeUInt16BE(4, 8);

  return Buffer.concat([
    header,
    ptrName,
    ptrHead,
    ptrData,
    Buffer.from([0xc0, 0x0c]), // compression pointer back to the service name
    aHead,
    Buffer.from(ip),
  ]);
}

describe('buildQuery', () => {
  it('asks for _shelly._tcp PTR records with the unicast-response bit set', () => {
    const query = buildQuery();
    expect(query.readUInt16BE(4)).toBe(1); // one question
    expect(query.toString('latin1')).toContain('_shelly');
    expect(query.readUInt16BE(query.length - 4)).toBe(12); // PTR
    expect(query.readUInt16BE(query.length - 2)).toBe(0x8001); // QU + IN
  });
});

describe('parseShellyAddresses', () => {
  it('extracts A records from a _shelly._tcp response, following compression pointers', () => {
    expect(parseShellyAddresses(shellyResponse([192, 168, 1, 50]))).toEqual(['192.168.1.50']);
  });

  it('ignores responses for other services', () => {
    expect(parseShellyAddresses(shellyResponse([192, 168, 1, 50], '_http._tcp.local'))).toEqual([]);
  });

  it('returns nothing rather than throwing on a truncated packet', () => {
    const truncated = shellyResponse([10, 0, 0, 7]).subarray(0, 30);
    expect(parseShellyAddresses(truncated)).toEqual([]);
  });
});

describe('discoverViaMdns', () => {
  it('resolves to an empty list when nothing answers, instead of hanging or throwing', async () => {
    await expect(discoverViaMdns(50)).resolves.toEqual([]);
  });
});
