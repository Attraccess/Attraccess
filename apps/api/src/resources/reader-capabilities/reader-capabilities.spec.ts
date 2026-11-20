import { ResourceType } from '@attraccess/application-models';
import {
  ACCESS_ONLY_DOOR_MESSAGE,
  ATTRACTAP_READER_CAPABILITIES,
  ReaderCapabilities,
  ReaderCapabilityResource,
  allowedReaderActions,
  canAssign,
  effectiveReaderAction,
  readerActionRefusal,
  readerActionsFor,
} from './reader-capabilities';

const machine: ReaderCapabilityResource = {
  type: ResourceType.Machine,
  separateUnlockAndUnlatch: false,
  accessOnly: false,
};
const door: ReaderCapabilityResource = { type: ResourceType.Door, separateUnlockAndUnlatch: false, accessOnly: false };
const unlatchDoor: ReaderCapabilityResource = { ...door, separateUnlockAndUnlatch: true };
const accessOnlyDoor: ReaderCapabilityResource = { ...door, accessOnly: true };
const openOnly: ReaderCapabilities = { resourceTypes: [ResourceType.Door], actions: ['open'] };

describe('reader capabilities', () => {
  describe('readerActionsFor', () => {
    it.each([
      ['a machine', machine, ['start', 'stop']],
      ['a door', door, ['lock', 'unlock']],
      ['a door with separate unlatching', unlatchDoor, ['lock', 'unlock', 'unlatch']],
      ['an access-only door', accessOnlyDoor, ['open']],
      [
        'an access-only door with a stale unlatch flag',
        { ...accessOnlyDoor, separateUnlockAndUnlatch: true },
        ['open'],
      ],
      ['a machine with a stale access-only flag', { ...machine, accessOnly: true }, ['start', 'stop']],
    ])('lists the actions of %s', (_name, resource, actions) => {
      expect(readerActionsFor(resource)).toEqual(actions);
    });
  });

  describe('allowedReaderActions', () => {
    it('lets an Attractap do everything a resource allows', () => {
      for (const resource of [machine, door, unlatchDoor, accessOnlyDoor]) {
        expect(allowedReaderActions(ATTRACTAP_READER_CAPABILITIES, resource)).toEqual(readerActionsFor(resource));
      }
    });

    it('intersects the reader actions with the resource actions', () => {
      expect(allowedReaderActions(openOnly, accessOnlyDoor)).toEqual(['open']);
      expect(allowedReaderActions(openOnly, door)).toEqual([]);
    });

    it('allows nothing on a resource type the reader does not serve', () => {
      expect(allowedReaderActions({ resourceTypes: [ResourceType.Door], actions: ['start'] }, machine)).toEqual([]);
    });
  });

  describe('canAssign', () => {
    it('assigns an Attractap to every resource kind', () => {
      for (const resource of [machine, door, unlatchDoor, accessOnlyDoor]) {
        expect(canAssign(ATTRACTAP_READER_CAPABILITIES, resource)).toBe(true);
      }
    });

    it('refuses a resource the reader cannot act on', () => {
      expect(canAssign(openOnly, accessOnlyDoor)).toBe(true);
      expect(canAssign(openOnly, door)).toBe(false);
      expect(canAssign(openOnly, machine)).toBe(false);
    });
  });

  describe('effectiveReaderAction', () => {
    it('takes unlock on an access-only door as Open', () => {
      expect(effectiveReaderAction('unlock', accessOnlyDoor)).toBe('open');
      expect(effectiveReaderAction('unlock', door)).toBe('unlock');
      expect(effectiveReaderAction('lock', accessOnlyDoor)).toBe('lock');
    });
  });

  describe('readerActionRefusal', () => {
    const caps = ATTRACTAP_READER_CAPABILITIES;

    it('allows what the resource allows', () => {
      expect(readerActionRefusal(caps, door, 'lock')).toBeNull();
      expect(readerActionRefusal(caps, machine, 'start')).toBeNull();
      expect(readerActionRefusal(caps, accessOnlyDoor, 'open')).toBeNull();
      expect(readerActionRefusal(caps, accessOnlyDoor, 'unlock')).toBeNull();
    });

    it('refuses lock and unlatch on an access-only door', () => {
      expect(readerActionRefusal(caps, accessOnlyDoor, 'lock')).toBe(ACCESS_ONLY_DOOR_MESSAGE);
      expect(readerActionRefusal(caps, accessOnlyDoor, 'unlatch')).toBe(ACCESS_ONLY_DOOR_MESSAGE);
    });

    it('explains the other refusals', () => {
      expect(readerActionRefusal(caps, door, 'unlatch')).toBe('This door does not support unlatching');
      expect(readerActionRefusal(caps, door, 'open')).toBe('This resource does not support this action');
      expect(readerActionRefusal(caps, machine, 'lock')).toBe('This resource does not support this action');
      expect(readerActionRefusal(openOnly, machine, 'start')).toBe('This reader cannot serve this resource');
    });
  });
});
