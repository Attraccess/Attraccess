import { readFileSync } from 'fs';
import { join } from 'path';
import {
  READER_UI_COMPONENTS,
  READER_UI_ICONS,
  READER_UI_LIMITS,
  READER_UI_RESERVED_STATUS_STRINGS,
  READER_UI_SCHEMA_VERSION,
  READER_UI_SLOTS,
  READER_UI_SLOT_NODE_BUDGET,
  READER_UI_STEP_KINDS,
  READER_UI_TEXT_STYLES,
  READER_UI_TIMING,
  READER_UI_TONES,
} from '@attraccess/plugins-backend-sdk';

const firmwareUi = (file: string) =>
  readFileSync(join(__dirname, '../../../../../apps/attractap/firmware/src/display/ui', file), 'utf8');
const header = firmwareUi('ui_schema.hpp');
const record = firmwareUi('ui_record.cpp');
const stepParse = firmwareUi('ui_step_parse.hpp');

/** Source between two markers, so a string compare is attributed to the right parser. */
function section(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  if (start < 0 || end < 0) throw new Error(`firmware source changed: cannot find ${from} .. ${to}`);
  return source.slice(start, end);
}

/** Every literal the firmware compares variable `name` against (`strcmp(name, "...")`). */
function compared(source: string, name: string): string[] {
  const found = [...source.matchAll(new RegExp(`strcmp\\(${name},\\s*"([^"]*)"\\)`, 'g'))].map((m) => m[1]);
  return [...new Set(found)].sort();
}

/** C string literals of an array initializer, with `\\xHH` escapes decoded as UTF-8 bytes. */
function cStringArray(source: string, name: string): string[] {
  const body = new RegExp(`${name}\\[\\]\\s*=\\s*\\{([\\s\\S]*?)\\};`).exec(source)?.[1];
  if (!body) throw new Error(`firmware source is missing ${name}[]`);
  return [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => {
    const bytes = m[1].replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    return Buffer.from(bytes, 'latin1').toString('utf8');
  });
}

const sorted = (values: readonly string[]) => [...values].sort();

function constant(name: string): number {
  const match = new RegExp(`constexpr\\s+(?:int|size_t)\\s+${name}\\s*=\\s*(\\d+);`).exec(header);
  if (!match) throw new Error(`ui_schema.hpp is missing ${name}`);
  return Number(match[1]);
}

function str(name: string): string {
  const match = new RegExp(`constexpr\\s+const\\s+char\\s*\\*\\s*${name}\\s*=\\s*"([^"]+)";`).exec(header);
  if (!match) throw new Error(`ui_schema.hpp is missing ${name}`);
  return match[1];
}

describe('ui_schema.hpp parity with the SDK', () => {
  it('matches numeric limits', () => {
    expect(constant('SCHEMA_VERSION')).toBe(READER_UI_SCHEMA_VERSION);
    expect(constant('MAX_PAYLOAD_BYTES')).toBe(READER_UI_LIMITS.maxPayloadBytes);
    expect(constant('MAX_FRAME_BYTES')).toBe(READER_UI_LIMITS.maxFrameBytes);
    expect(constant('MAX_NODES')).toBe(READER_UI_LIMITS.maxNodes);
    expect(constant('MAX_DEPTH')).toBe(READER_UI_LIMITS.maxDepth);
    expect(constant('MAX_LIVE_NODES')).toBe(READER_UI_LIMITS.maxLiveNodes);
    expect(constant('MAX_TEXT_CHARS')).toBe(READER_UI_LIMITS.maxTextChars);
    expect(constant('MAX_LABEL_BYTES')).toBe(READER_UI_LIMITS.maxLabelBytes);
    expect(constant('MAX_LIST_ROW_CHARS')).toBe(READER_UI_LIMITS.maxListRowChars);
    expect(constant('MAX_CHOICES')).toBe(READER_UI_LIMITS.maxChoices);
    const idMax = /\{1,(\d+)\}/.exec(READER_UI_LIMITS.idPattern.source)?.[1];
    expect(constant('MAX_ID_CHARS')).toBe(Number(idMax));
  });

  it('matches timing and slot budgets', () => {
    expect(constant('STEP_DEFAULT_TTL_SEC')).toBe(READER_UI_TIMING.stepDefaultTtlSec);
    expect(constant('STEP_MAX_TTL_SEC')).toBe(READER_UI_TIMING.stepMaxTtlSec);
    expect(constant('POST_STOP_DEFAULT_TTL_SEC')).toBe(READER_UI_TIMING.postStopDefaultTtlSec);
    expect(constant('POST_STOP_MAX_TTL_SEC')).toBe(READER_UI_TIMING.postStopMaxTtlSec);
    expect(constant('SLOT_BUDGET_LIST_ROW_STATUS')).toBe(
      READER_UI_SLOT_NODE_BUDGET[READER_UI_SLOTS.RESOURCE_LIST_ROW_STATUS],
    );
    expect(constant('SLOT_BUDGET_DETAILS_HEADER')).toBe(
      READER_UI_SLOT_NODE_BUDGET[READER_UI_SLOTS.RESOURCE_DETAILS_HEADER],
    );
    expect(constant('SLOT_BUDGET_DETAILS_BODY')).toBe(
      READER_UI_SLOT_NODE_BUDGET[READER_UI_SLOTS.RESOURCE_DETAILS_BODY],
    );
    expect(constant('SLOT_BUDGET_DETAILS_SESSION')).toBe(
      READER_UI_SLOT_NODE_BUDGET[READER_UI_SLOTS.RESOURCE_DETAILS_SESSION],
    );
  });

  it('matches slot ids', () => {
    expect(str('SLOT_LIST_ROW_STATUS')).toBe(READER_UI_SLOTS.RESOURCE_LIST_ROW_STATUS);
    expect(str('SLOT_DETAILS_HEADER')).toBe(READER_UI_SLOTS.RESOURCE_DETAILS_HEADER);
    expect(str('SLOT_DETAILS_BODY')).toBe(READER_UI_SLOTS.RESOURCE_DETAILS_BODY);
    expect(str('SLOT_DETAILS_SESSION')).toBe(READER_UI_SLOTS.RESOURCE_DETAILS_SESSION);
  });

  describe('ui_record.cpp and ui_step_parse.hpp parity with the SDK', () => {
    const fillNode = section(record, 'Verdict fillNode', 'Verdict flatten');

    it('knows exactly the SDK components', () => {
      expect(compared(fillNode, 't')).toEqual(sorted(READER_UI_COMPONENTS));
    });

    it('knows exactly the SDK icons, tones and text styles', () => {
      expect(compared(fillNode, 'n')).toEqual(sorted(READER_UI_ICONS));
      expect(compared(fillNode, 'st')).toEqual(sorted(READER_UI_TEXT_STYLES));
      expect(compared(section(record, 'bool toneFrom', 'bool smallInt'), 's')).toEqual(sorted(READER_UI_TONES));
      expect(compared(stepParse, 'tone')).toEqual(sorted(READER_UI_TONES));
    });

    it('knows exactly the SDK step kinds plus the Lite card-confirm', () => {
      expect(compared(stepParse, 'kind')).toEqual(sorted([...READER_UI_STEP_KINDS, 'card-confirm']));
    });

    it('reserves exactly the SDK core status strings', () => {
      expect(sorted(cStringArray(record, 'RESERVED'))).toEqual(sorted(READER_UI_RESERVED_STATUS_STRINGS));
    });
  });
});
