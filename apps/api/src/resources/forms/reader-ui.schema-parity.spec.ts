import { readFileSync } from 'fs';
import { join } from 'path';
import {
  READER_UI_LIMITS,
  READER_UI_SCHEMA_VERSION,
  READER_UI_SLOTS,
  READER_UI_SLOT_NODE_BUDGET,
  READER_UI_TIMING,
} from '@attraccess/plugins-backend-sdk';

const header = readFileSync(
  join(__dirname, '../../../../../apps/attractap/firmware/src/display/ui/ui_schema.hpp'),
  'utf8',
);

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
    expect(constant('MAX_ID_CHARS')).toBe(24);
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
});
