import { createCipheriv } from 'node:crypto';
import { aesCmac, cbcDecrypt } from './aes';
import {
  addPadding,
  CardProtocolError,
  cmacShort,
  COMM_MODE,
  crc32,
  deriveSessionKeys,
  Ev2Session,
  INS_CHANGE_KEY,
} from './ev2-session';
import {
  additionalFrame,
  desfireCreateApplication,
  desfireGetKeyVersion,
  desfireSelectApplication,
  getVersion,
  ntagIsoSelectApplication,
  parsePlainOk,
} from './card-commands';
import { EmulatedCard } from './card-emulator.test-fixture';

const hex = (s: string) => Buffer.from(s.replace(/\s/g, ''), 'hex');

/** Deterministic randomness so exchanges can be compared byte for byte. */
function seeded(...chunks: Buffer[]) {
  const queue = [...chunks];
  return (n: number) => {
    const next = queue.shift();
    if (!next || next.length !== n) throw new Error('unexpected random request');
    return Buffer.from(next);
  };
}

function authenticate(card: EmulatedCard, session: Ev2Session, keyNo: number, key: Buffer) {
  const r1 = card.transceive(session.beginAuthentication(keyNo, key));
  const r2 = card.transceive(session.continueAuthentication(r1));
  session.finishAuthentication(r2);
}

/** Puts a session into a known authenticated state, for published vectors that start mid-session. */
function restoredSession(state: { enc: string; mac: string; ti: string; counter: number; authKeyNo: number }) {
  const session = new Ev2Session();
  Object.assign(session, {
    phase: 'authenticated',
    keyEnc: hex(state.enc),
    keyMac: hex(state.mac),
    ti: hex(state.ti),
    counter: state.counter,
    authKeyNo: state.authKeyNo,
  });
  return session;
}

/** Valid response MAC for a session, as a card would compute it after the counter advanced. */
function cardMac(macKey: Buffer, sw2: number, counter: number, ti: Buffer, data: Buffer) {
  return cmacShort(macKey, Buffer.concat([Buffer.from([sw2, counter & 0xff, counter >> 8]), ti, data]));
}

describe('card crypto primitives', () => {
  it('matches the RFC 4493 AES-CMAC vectors', () => {
    const key = hex('2b7e151628aed2a6abf7158809cf4f3c');
    expect(aesCmac(key, Buffer.alloc(0)).toString('hex')).toBe('bb1d6929e95937287fa37d129b756746');
    expect(aesCmac(key, hex('6bc1bee22e409f96e93d7e117393172a')).toString('hex')).toBe(
      '070a16b46b4d4144f79bdd9dd04a287c',
    );
    expect(
      aesCmac(key, hex('6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411')).toString(
        'hex',
      ),
    ).toBe('dfa66747de9ae63030ca32611497c827');
    expect(
      aesCmac(
        key,
        hex(
          '6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710',
        ),
      ).toString('hex'),
    ).toBe('51f0bebf7e3b9d92fc49741779363cfe');
  });

  it('truncates the CMAC to its odd-indexed bytes (MACt)', () => {
    const key = hex('2b7e151628aed2a6abf7158809cf4f3c');
    // full CMAC of the empty message: bb1d6929e95937287fa37d129b756746
    expect(cmacShort(key, Buffer.alloc(0))).toEqual(hex('1d 29 59 28 a3 12 75 46'));
  });

  it('pads like the firmware (always adds a block when aligned)', () => {
    expect(addPadding(Buffer.alloc(16)).length).toBe(32);
    expect(addPadding(Buffer.alloc(5))).toEqual(
      Buffer.concat([Buffer.alloc(5), Buffer.from([0x80]), Buffer.alloc(10)]),
    );
  });

  it('computes zlib CRC-32', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('builds the plain commands like the firmware', () => {
    expect(desfireSelectApplication().toString('hex')).toBe('905a00000355ceac00');
    expect(desfireCreateApplication().toString('hex')).toBe('90ca00000555ceac0f8600');
    expect(desfireGetKeyVersion(3).toString('hex')).toBe('9064000001' + '03' + '00');
    expect(ntagIsoSelectApplication().toString('hex')).toBe('00a4040007d276000085010100');
    expect(getVersion().toString('hex')).toBe('9060000000');
    expect(additionalFrame().toString('hex')).toBe('90af000000');
  });
});

describe('NXP AN12196 known-answer vectors', () => {
  const zeroKey = Buffer.alloc(16);

  it('reproduces the AuthenticateEV2First exchange', () => {
    const rndA = hex('13C5DB8A5930439FC3DEF9A4C675360F');
    const encRndB = hex('A04C124213C186F22399D33AC2A30215');
    const session = new Ev2Session(seeded(rndA));
    expect(session.beginAuthentication(0, zeroKey).toString('hex')).toBe('9071000005000300000000');
    const part2 = session.continueAuthentication(Buffer.concat([encRndB, hex('91AF')]));
    expect(part2).toEqual(hex('90AF000020 35C3E05A752E0144BAC0DE51C1F22C56B34408A23D8AEA266CAB947EA8E0118D 00'));
    const cardReply = hex('3FA64DB5446D1F34CD6EA311167F5E4985B89690C04A05F17FA7AB2F08120663');
    session.finishAuthentication(Buffer.concat([cardReply, hex('9100')]));
    expect(session.authenticated).toBe(true);
    expect(cbcDecrypt(zeroKey, Buffer.alloc(16), cardReply).subarray(0, 4)).toEqual(hex('9D00C4DF'));

    const rndB = cbcDecrypt(zeroKey, Buffer.alloc(16), encRndB);
    const keys = deriveSessionKeys(zeroKey, rndA, rndB);
    expect(keys.enc).toEqual(hex('1309C877509E5A215007FF0ED19CA564'));
    expect(keys.mac).toEqual(hex('4C6626F5E72EA694202139295C7A7FC7'));
  });

  const changeKeySession = { enc: '4CF3CB41A22583A61E89B158D252FC53', mac: '5529860B2FC5FB6154B7F28361D30BF9' };
  const newKey = hex('5004BF991F408672B1EF00F08F9E8647');

  it('reproduces the ChangeKey (key 0) command', () => {
    const session = restoredSession({ ...changeKeySession, ti: '7614281A', counter: 3, authKeyNo: 0 });
    expect(session.encodeChangeKey(zeroKey, newKey, 0, 1)).toEqual(
      hex('90C4000029 00 C0EB4DEEFEDDF0B513A03A95A75491818580503190D4D05053FF75668A01D6FD A6610234BDED6432 00'),
    );
  });

  it('reproduces the ChangeKey (key 2) exchange and verifies the card MAC', () => {
    const session = () => restoredSession({ ...changeKeySession, ti: '7614281A', counter: 2, authKeyNo: 0 });
    const oldKey = zeroKey;
    const key2 = hex('F3847D627727ED3BC9C4CC050489B966');
    const confirmed = session();
    expect(confirmed.encodeChangeKey(oldKey, key2, 2, 1)).toEqual(
      hex(
        '90C4000029 02 2CF362B7BF4311FF3BE1DAA295E8C68DE09050560D19B9E16C2393AE9CD1FAC75D0CE20B CD1D06E6 00'.replace(
          / /g,
          '',
        ),
      ),
    );
    expect(confirmed.decodeChangeKey(hex('203BB55D1089D587 9100'))).toBe('confirmed');
    expect(confirmed.authenticated).toBe(true);

    // The MAC covers SW2 only; a reader that flips SW1 turns success into failure, never the reverse.
    const flipped = session();
    flipped.encodeChangeKey(oldKey, key2, 2, 1);
    expect(flipped.decodeChangeKey(hex('203BB55D1089D587 9000'))).toBe('failed');
    expect(flipped.authenticated).toBe(false);
  });

  // Regression guard computed by this port (no published vector exercises a counter above 255).
  it('keeps the firmware IV quirk: the counter high byte is not part of the IV', () => {
    const session = restoredSession({ ...changeKeySession, ti: '7614281A', counter: 0x0103, authKeyNo: 0 });
    // Same ciphertext as counter 3 (IV ignores the high byte), but the MAC covers both counter bytes.
    expect(session.encodeChangeKey(zeroKey, newKey, 0, 1)).toEqual(
      hex('90C4000029 00 C0EB4DEEFEDDF0B513A03A95A75491818580503190D4D05053FF75668A01D6FD 012d74a4b24f3bd9 00'),
    );
  });
});

describe.each(['desfire', 'ntag424'] as const)('EV2 session against emulated %s', (kind) => {
  const select = (card: EmulatedCard) => {
    if (kind === 'desfire') {
      expect(parsePlainOk(card.transceive(desfireCreateApplication()))).not.toBeNull();
      expect(parsePlainOk(card.transceive(desfireSelectApplication()))).not.toBeNull();
    } else {
      expect(card.transceive(ntagIsoSelectApplication())).toEqual(hex('9000'));
    }
  };

  it('authenticates with the factory key', () => {
    const card = new EmulatedCard(kind, undefined, seeded(hex('00112233445566778899aabbccddeeff'), hex('01020304')));
    select(card);
    const session = new Ev2Session(seeded(hex('ffeeddccbbaa99887766554433221100')));
    authenticate(card, session, 0, Buffer.alloc(16));
    expect(session.authenticated).toBe(true);
    expect(session.authenticatedKeyNo).toBe(0);
  });

  it('changes a key and re-authenticates with the new key', () => {
    const card = new EmulatedCard(kind);
    select(card);
    const factory = Buffer.alloc(16);
    const session = new Ev2Session();
    authenticate(card, session, 0, factory);
    const newKey = hex('000102030405060708090a0b0c0d0e0f');
    const apdu = session.encodeChangeKey(factory, newKey, 2, 0x01);
    expect(apdu.length).toBe(47);
    expect(session.decodeChangeKey(card.transceive(apdu))).toBe('confirmed');
    expect(card.keys[2]).toEqual(newKey);
    expect(card.keyVersions[2]).toBe(1);

    const verify = new Ev2Session();
    authenticate(card, verify, 2, newKey);
    expect(verify.authenticated).toBe(true);
    expect(() => authenticate(card, new Ev2Session(), 2, factory)).toThrow(CardProtocolError);
  });

  it('changes the key it authenticated with: bare 91 00 ends the session', () => {
    const card = new EmulatedCard(kind);
    select(card);
    const session = new Ev2Session();
    authenticate(card, session, 0, Buffer.alloc(16));
    const newKey = Buffer.alloc(16, 7);
    const response = card.transceive(session.encodeChangeKey(Buffer.alloc(16), newKey, 0, 2));
    expect(response).toEqual(hex('9100'));
    expect(session.decodeChangeKey(response)).toBe('reauthenticate');
    expect(session.authenticated).toBe(false);
    expect(card.keys[0]).toEqual(newKey);
    authenticate(card, new Ev2Session(), 0, newKey);
  });

  it('rejects a card that does not know the key', () => {
    const card = new EmulatedCard(kind);
    card.keys[1] = Buffer.alloc(16, 0x42);
    select(card);
    expect(() => authenticate(card, new Ev2Session(), 1, Buffer.alloc(16))).toThrow(CardProtocolError);
  });

  it('rejects a card that does not prove knowledge of RndA', () => {
    const card = new EmulatedCard(kind);
    select(card);
    card.misbehaviour = 'no-proof';
    expect(() => authenticate(card, new Ev2Session(), 0, Buffer.alloc(16))).toThrow(/prove knowledge/);
  });

  it('rejects a card that rotates RndA the wrong way', () => {
    const card = new EmulatedCard(kind);
    select(card);
    card.misbehaviour = 'wrong-rotation';
    expect(() => authenticate(card, new Ev2Session(), 0, Buffer.alloc(16))).toThrow(/prove knowledge/);
  });

  it('rejects a response with a bad CMAC and ends the session', () => {
    const card = new EmulatedCard(kind);
    select(card);
    const session = new Ev2Session();
    authenticate(card, session, 0, Buffer.alloc(16));
    card.misbehaviour = 'bad-response-mac';
    const apdu = session.encodeChangeKey(Buffer.alloc(16), Buffer.alloc(16, 1), 1, 1);
    expect(session.decodeChangeKey(card.transceive(apdu))).toBe('failed');
    expect(session.authenticated).toBe(false);
  });

  it('rejects a replayed response after the counter advanced', () => {
    const card = new EmulatedCard(kind);
    select(card);
    const session = new Ev2Session();
    authenticate(card, session, 0, Buffer.alloc(16));
    expect(
      session.decodeChangeKey(card.transceive(session.encodeChangeKey(Buffer.alloc(16), Buffer.alloc(16, 1), 1, 1))),
    ).toBe('confirmed');
    card.misbehaviour = 'replay-last-response';
    const second = session.encodeChangeKey(Buffer.alloc(16), Buffer.alloc(16, 2), 2, 1);
    expect(session.decodeChangeKey(card.transceive(second))).toBe('failed');
  });

  it('rejects an authentication reply replayed from an earlier session', () => {
    const card = new EmulatedCard(kind);
    select(card);
    const first = new Ev2Session();
    const r1 = card.transceive(first.beginAuthentication(0, Buffer.alloc(16)));
    const r2 = card.transceive(first.continueAuthentication(r1));
    first.finishAuthentication(r2);

    const second = new Ev2Session();
    second.beginAuthentication(0, Buffer.alloc(16));
    second.continueAuthentication(r1);
    expect(() => second.finishAuthentication(r2)).toThrow(/prove knowledge/);
  });

  it('does not accept a ChangeKey success forged by the reader', () => {
    const card = new EmulatedCard(kind);
    select(card);
    const session = new Ev2Session();
    authenticate(card, session, 0, Buffer.alloc(16));
    card.misbehaviour = 'forge-bare-success';
    const apdu = session.encodeChangeKey(Buffer.alloc(16), Buffer.alloc(16, 3), 2, 1);
    expect(session.decodeChangeKey(card.transceive(apdu))).toBe('failed');
    expect(card.keys[2]).toEqual(Buffer.alloc(16));
    expect(session.authenticated).toBe(false);
  });

  it('reports a failed write (tearing) and ends the session', () => {
    const card = new EmulatedCard(kind);
    card.failWritesAfter = 0;
    select(card);
    const session = new Ev2Session();
    authenticate(card, session, 0, Buffer.alloc(16));
    const apdu = session.encodeChangeKey(Buffer.alloc(16), Buffer.alloc(16, 4), 1, 1);
    expect(session.decodeChangeKey(card.transceive(apdu))).toBe('failed');
    expect(session.authenticated).toBe(false);
    expect(card.authenticated).toBe(false);
    expect(card.keys[1]).toEqual(Buffer.alloc(16));
  });
});

describe('Ev2Session state checks', () => {
  const authenticated = () => {
    const card = new EmulatedCard('desfire');
    card.transceive(desfireCreateApplication());
    card.transceive(desfireSelectApplication());
    const session = new Ev2Session();
    authenticate(card, session, 0, Buffer.alloc(16));
    return session;
  };

  it('rejects malformed authentication frames', () => {
    for (const length of [2, 17, 19]) {
      const session = new Ev2Session();
      session.beginAuthentication(1, Buffer.alloc(16));
      const reply = Buffer.concat([Buffer.alloc(length - 2), hex('91AF')]);
      expect(() => session.continueAuthentication(reply)).toThrow(CardProtocolError);
    }
    for (const length of [33, 35]) {
      const session = new Ev2Session(seeded(Buffer.alloc(16, 9)));
      session.beginAuthentication(1, Buffer.alloc(16));
      session.continueAuthentication(Buffer.concat([Buffer.alloc(16), hex('91AF')]));
      const reply = Buffer.concat([Buffer.alloc(length - 2), hex('9100')]);
      expect(() => session.finishAuthentication(reply)).toThrow(CardProtocolError);
    }
  });

  it('rejects bad keys and key numbers', () => {
    expect(() => new Ev2Session().beginAuthentication(0, Buffer.alloc(15))).toThrow(CardProtocolError);
    expect(() => new Ev2Session().beginAuthentication(14, Buffer.alloc(16))).toThrow(CardProtocolError);
    const session = authenticated();
    expect(() => session.encodeChangeKey(Buffer.alloc(16), Buffer.alloc(15), 1, 1)).toThrow(CardProtocolError);
    expect(() => session.encodeChangeKey(Buffer.alloc(16), Buffer.alloc(16), 1, 256)).toThrow(CardProtocolError);
  });

  it('refuses commands without authentication or without a pending command', () => {
    expect(() =>
      new Ev2Session().encodeCommand(INS_CHANGE_KEY, Buffer.alloc(1), Buffer.alloc(0), COMM_MODE.FULL),
    ).toThrow('not authenticated');
    const session = authenticated();
    expect(() => session.decodeResponse(hex('9100'))).toThrow(/no command/);
    session.encodeCommand(0x6e, Buffer.alloc(0), Buffer.alloc(0), COMM_MODE.MAC);
    expect(() => session.encodeCommand(0x6e, Buffer.alloc(0), Buffer.alloc(0), COMM_MODE.MAC)).toThrow(/no response/);
  });

  it('refuses commands that do not fit the reader', () => {
    const session = authenticated();
    expect(() => session.encodeCommand(0x8d, Buffer.alloc(7), Buffer.alloc(32), COMM_MODE.FULL)).toThrow(
      /does not fit/,
    );
  });

  it.each([COMM_MODE.MAC, COMM_MODE.FULL])('rejects short success replies without a MAC in mode %s', (mode) => {
    const session = authenticated();
    session.encodeCommand(0x6e, Buffer.alloc(0), Buffer.alloc(0), mode);
    expect(() => session.decodeResponse(hex('01020304050607 9100'))).toThrow(/MAC missing/);
    expect(session.authenticated).toBe(false);
  });

  it('returns short error replies and ends the session', () => {
    const session = authenticated();
    session.encodeCommand(0x6e, Buffer.alloc(0), Buffer.alloc(0), COMM_MODE.MAC);
    expect(session.decodeResponse(hex('911E')).status).toBe(0x911e);
    expect(session.authenticated).toBe(false);
  });

  it('decrypts and unpads FULL mode replies', () => {
    const state = { enc: '1309C877509E5A215007FF0ED19CA564', mac: '4C6626F5E72EA694202139295C7A7FC7', ti: '9D00C4DF' };
    const session = restoredSession({ ...state, counter: 0, authKeyNo: 0 });
    session.encodeCommand(0xf5, Buffer.from([0x02]), Buffer.alloc(0), COMM_MODE.FULL);
    // Card side: IV for the response uses 5A A5 and the incremented counter.
    const ivPlain = Buffer.concat([hex('5AA5'), hex(state.ti), Buffer.from([1]), Buffer.alloc(9)]);
    const ecb = createCipheriv('aes-128-ecb', hex(state.enc), null).setAutoPadding(false);
    const iv = Buffer.concat([ecb.update(ivPlain), ecb.final()]);
    const cbc = createCipheriv('aes-128-cbc', hex(state.enc), iv).setAutoPadding(false);
    const payload = hex('0040EEEE000100D1FE001F00004400004400002000006A0000');
    const encrypted = Buffer.concat([cbc.update(addPadding(payload)), cbc.final()]);
    const mac = cardMac(hex(state.mac), 0x00, 1, hex(state.ti), encrypted);
    const result = session.decodeResponse(Buffer.concat([encrypted, mac, hex('9100')]));
    expect(result).toEqual({ data: payload, status: 0x9100 });
    expect(session.authenticated).toBe(true);
  });
});

describe('DESFire key slots', () => {
  it('reports key versions via GetKeyVersion for slots 1-5', () => {
    const card = new EmulatedCard('desfire');
    card.transceive(desfireCreateApplication());
    card.transceive(desfireSelectApplication());
    card.keyVersions[1] = 1;
    const versions = [1, 2, 3, 4, 5].map((i) => parsePlainOk(card.transceive(desfireGetKeyVersion(i)), 1)?.[0]);
    expect(versions).toEqual([1, 0, 0, 0, 0]);
  });

  it('refuses to create the application twice', () => {
    const card = new EmulatedCard('desfire');
    expect(card.transceive(desfireCreateApplication())).toEqual(hex('9100'));
    expect(card.transceive(desfireCreateApplication())).toEqual(hex('91DE'));
  });
});
