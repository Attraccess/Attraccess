import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CardChannel,
  CardKind,
  FACTORY_KEY,
  KEY_VERSION_ENROLLED,
  KEY_VERSION_FREE,
  authenticate,
  changeKeyAndVerify,
  detectCardKind,
  findFreeKeyNo,
} from './card-operations';

/**
 * The server's card code is a straight port of the firmware's. These recordings were made by
 * running the firmware's own card code (firmware 1.7.x, before the card checks moved to the
 * server; see apps/attractap/firmware/tests/reference-recordings/record.sh) against a card with
 * every random value scripted. Given the same card answers and the same randoms, the server has to
 * send exactly the same bytes, command for command. Recordings from real cards (tap, enrollment,
 * reset) use the same format and can be added to the folder.
 */
const RECORDINGS = join(__dirname, '../../../../attractap/firmware/tests/reference-recordings/recordings');

interface Recording {
  name: string;
  cardKind: CardKind;
  operation: 'enroll' | 'tap' | 'tap-wrong-key' | 'reset';
  success: boolean;
  storedKey: string;
  newKey: string;
  wrongKey: string;
  randomBytesConsumed: string;
  exchanges: Array<{ tx: string; rx: string }>;
}

const recordings: Recording[] = readdirSync(RECORDINGS)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(RECORDINGS, name), 'utf8')));

async function replay(recording: Recording): Promise<boolean> {
  const randoms = Buffer.from(recording.randomBytesConsumed, 'hex');
  let randomPosition = 0;
  const random = (size: number) => {
    const bytes = Buffer.from(randoms.subarray(randomPosition, randomPosition + size));
    randomPosition += size;
    return bytes;
  };
  let position = 0;
  const channel: CardChannel = {
    uid: '04aabbccddee80',
    exchange: async (apdu) => {
      const expected = recording.exchanges[position++];
      expect(expected).toBeDefined();
      expect(apdu.toString('hex')).toBe(expected.tx);
      return Buffer.from(expected.rx, 'hex');
    },
  };

  const detected = await detectCardKind(channel);
  expect(detected).toEqual({ ok: true, kind: recording.cardKind });
  const kind = recording.cardKind;
  const key = (hex: string) => Buffer.from(hex, 'hex');

  let success: boolean;
  switch (recording.operation) {
    case 'enroll': {
      const keyNo = await findFreeKeyNo(channel, kind, random);
      expect(keyNo).toBe(1);
      success =
        (await changeKeyAndVerify(
          channel,
          kind,
          keyNo as number,
          FACTORY_KEY,
          FACTORY_KEY,
          key(recording.newKey),
          KEY_VERSION_ENROLLED,
          random,
        )) === 'done';
      break;
    }
    case 'tap':
      success = (await authenticate(channel, kind, 1, key(recording.storedKey), random)) !== null;
      break;
    case 'tap-wrong-key':
      success = (await authenticate(channel, kind, 1, key(recording.wrongKey), random)) !== null;
      break;
    case 'reset':
      success =
        (await changeKeyAndVerify(
          channel,
          kind,
          1,
          FACTORY_KEY,
          key(recording.storedKey),
          FACTORY_KEY,
          KEY_VERSION_FREE,
          random,
        )) === 'done';
      break;
  }

  // Not a single command more or fewer, and no random byte left over.
  expect(position).toBe(recording.exchanges.length);
  expect(randomPosition).toBe(randoms.length);
  return success;
}

describe('server card crypto against recordings of the firmware', () => {
  it('has recordings for tap, enrollment and reset on both card families', () => {
    const names = recordings.map((recording) => recording.name);
    for (const kind of ['ntag424', 'desfire']) {
      for (const operation of ['enroll', 'tap', 'tap-wrong-key', 'reset'])
        expect(names).toContain(`${kind}-${operation}`);
    }
  });

  it.each(recordings.map((recording) => [recording.name, recording] as const))(
    '%s: sends the same bytes as the firmware',
    async (_name, recording) => {
      expect(await replay(recording)).toBe(recording.success);
    },
  );
});
