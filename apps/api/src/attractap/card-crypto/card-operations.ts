import {
  additionalFrame,
  desfireCreateApplication,
  desfireGetKeyVersion,
  desfireSelectApplication,
  getVersion,
  ntagIsoSelectApplication,
  parsePlainOk,
} from './card-commands';
import { CardProtocolError, Ev2Session, STATUS_ISO_OK } from './ev2-session';

/**
 * Card conversations written straight-line on top of a channel that relays one
 * APDU at a time. Each function mirrors the firmware routine it replaces
 * (rfid.cpp NFC::authenticateInternal / changeKey / getAvailableKeyNo /
 * detectCardType); card keys never leave the server.
 */
export interface CardChannel {
  readonly uid: string;
  /** Relays one complete APDU and resolves with the card's answer (including status). Rejects when the card is gone or the conversation ended. */
  exchange(apdu: Buffer): Promise<Buffer>;
}

export type CardKind = 'desfire' | 'ntag424';

export const FACTORY_KEY = Buffer.alloc(16);
/** First and last data key slot used by Attraccess (slot 0 is the master key). */
export const FIRST_DATA_KEY_NO = 1;
export const LAST_DATA_KEY_NO = 5;
export const KEY_VERSION_FREE = 0x00;
export const KEY_VERSION_ENROLLED = 0x01;
const DESFIRE_HW_TYPE = 0x01;
const VENDOR_NXP = 0x04;
const DESFIRE_HW_MAJOR_EV2 = 0x12;

export type CardCheckResult = { ok: true; kind: CardKind } | { ok: false; reason: 'desfire-ev1' };

/**
 * GetVersion (3 frames, as the firmware sends them) and classify the card like NFC::detectCardType
 * and NFC::authenticateInternal: DESFire takes the DESFire path, everything else (NTAG 424, other
 * vendors, short or garbled answers, unknown hardware types) the NTAG 424 path. DESFire EV1 has no
 * AuthenticateEV2First and is refused.
 */
export async function detectCardKind(channel: CardChannel): Promise<CardCheckResult> {
  const first = await channel.exchange(getVersion());
  await channel.exchange(additionalFrame());
  await channel.exchange(additionalFrame());
  const nxp = first.length >= 9 && first[0] === VENDOR_NXP;
  if (!nxp || first[1] !== DESFIRE_HW_TYPE) return { ok: true, kind: 'ntag424' };
  return first[3] < DESFIRE_HW_MAJOR_EV2 ? { ok: false, reason: 'desfire-ev1' } : { ok: true, kind: 'desfire' };
}

async function selectAttraccessApp(channel: CardChannel, createIfMissing: boolean): Promise<boolean> {
  if (parsePlainOk(await channel.exchange(desfireSelectApplication()))) return true;
  if (!createIfMissing) return false;
  if (!parsePlainOk(await channel.exchange(desfireCreateApplication()))) return false;
  return parsePlainOk(await channel.exchange(desfireSelectApplication())) !== null;
}

/** The AuthenticateEV2First handshake alone (ntag424_AuthenticateEV2First): the application must already be selected. */
async function authenticateEv2First(
  channel: CardChannel,
  keyNo: number,
  key: Buffer,
  random?: (size: number) => Buffer,
): Promise<Ev2Session | null> {
  const session = new Ev2Session(random);
  try {
    const second = session.continueAuthentication(await channel.exchange(session.beginAuthentication(keyNo, key)));
    session.finishAuthentication(await channel.exchange(second));
    return session;
  } catch (error) {
    if (error instanceof CardProtocolError) return null;
    throw error;
  }
}

/**
 * NFC::authenticateInternal. Resolves with the authenticated session, or null
 * when the card refused or failed to prove the key. A card that misbehaves on
 * the wire (wrong lengths, bad proof) counts as a refusal.
 */
export async function authenticate(
  channel: CardChannel,
  kind: CardKind,
  keyNo: number,
  key: Buffer,
  random?: (size: number) => Buffer,
): Promise<Ev2Session | null> {
  if (kind === 'desfire') {
    if (!(await selectAttraccessApp(channel, false))) return null;
  } else {
    const selected = await channel.exchange(ntagIsoSelectApplication());
    if (selected.length !== 2 || ((selected[0] << 8) | selected[1]) !== STATUS_ISO_OK) return null;
  }
  return authenticateEv2First(channel, keyNo, key, random);
}

/**
 * NFC::getAvailableKeyNo. DESFire: make sure the application exists, then the
 * first data slot whose key version is still free (the application master key
 * must be the factory key). NTAG 424: the first slot that accepts the factory key.
 * Resolves with the slot, or null when none is available.
 */
export async function findFreeKeyNo(
  channel: CardChannel,
  kind: CardKind,
  random?: (size: number) => Buffer,
): Promise<number | null> {
  if (kind === 'desfire') {
    if (!(await selectAttraccessApp(channel, true))) return null;
    for (let keyNo = FIRST_DATA_KEY_NO; keyNo <= LAST_DATA_KEY_NO; keyNo++) {
      const answer = await channel.exchange(desfireGetKeyVersion(keyNo));
      const version = parsePlainOk(answer, 1);
      if (!version) return null;
      if (version[0] === KEY_VERSION_FREE) {
        // As in the firmware: the application is still selected from above, so no second select.
        return (await authenticateEv2First(channel, 0, FACTORY_KEY, random)) ? keyNo : null;
      }
    }
    return null;
  }
  for (let keyNo = FIRST_DATA_KEY_NO; keyNo <= LAST_DATA_KEY_NO; keyNo++) {
    if (await authenticate(channel, kind, keyNo, FACTORY_KEY, random)) return keyNo;
  }
  return null;
}

/**
 * NFC::changeKey: authenticate with the master key, write `newKey` into slot
 * `keyNo` (the card needs the previous key for slots above 0) and prove the
 * change by authenticating with the new key. Whatever the card says about the
 * write, only that final authentication counts.
 */
export async function changeKeyAndVerify(
  channel: CardChannel,
  kind: CardKind,
  keyNo: number,
  masterKey: Buffer,
  oldKey: Buffer,
  newKey: Buffer,
  keyVersion: number,
  random?: (size: number) => Buffer,
  hooks?: {
    /** Runs after the master key login succeeded, right before the ChangeKey command goes out (e.g. to save a recovery record). */
    beforeWrite?: () => Promise<void>;
  },
): Promise<'done' | 'master-refused' | 'not-confirmed'> {
  const master = await authenticate(channel, kind, 0, masterKey, random);
  if (!master) return 'master-refused';
  await hooks?.beforeWrite?.();
  try {
    const answer = await channel.exchange(master.encodeChangeKey(oldKey, newKey, keyNo, keyVersion));
    master.decodeChangeKey(answer);
  } catch (error) {
    if (!(error instanceof CardProtocolError)) throw error;
  }
  const proven = await authenticate(channel, kind, keyNo, newKey, random);
  return proven ? 'done' : 'not-confirmed';
}
