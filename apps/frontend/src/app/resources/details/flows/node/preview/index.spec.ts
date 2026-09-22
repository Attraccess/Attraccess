import { describe, expect, it } from 'vitest';
import { get } from 'lodash-es';
import { ResourceFlowNodeType as Type } from '@attraccess/react-query-client';
import { getNodePreviewRows } from './index';
import en from '../en.json';
import de from '../de.json';

const keyTranslation = (key: string) => key;

describe('flow node previews', () => {
  it.each(Object.values(Type))('supports missing node data for %s', (type) => {
    expect(Array.isArray(getNodePreviewRows(type, keyTranslation, null))).toBe(true);
  });

  it.each([en, de])('uses existing translations for populated previews', (translations) => {
    const translate = (key: string) => {
      const value = get(translations, key);
      expect(typeof value, key).toBe('string');
      return String(value);
    };
    const data = {
      label: 'Start',
      minInactivityMinutes: '5',
      topic: 'machine/state',
      duration: 3,
      unit: 'minutes',
      path: 'payload.ready',
      comparisonOperator: '==',
      comparisonValue: 'true',
      method: 'GET',
      url: 'https://example.test',
      entries: [{ key: 'result', value: 'ok' }],
      name: 'Material',
      notes: 'Finished',
      identifier: 'heartbeat',
      timeoutSeconds: 30,
      status: 'healthy',
      message: 'Stopped',
      source: 'any',
      watches: [{ key: 'ready', scope: 'resource' }],
      variables: [{ key: 'ready', value: 'true', scope: 'global', payloadPath: 'ready' }],
    };
    for (const type of Object.values(Type)) getNodePreviewRows(type, translate, { data });
  });

  it('limits payload summaries to three entries and retains blank entry fallbacks', () => {
    const rows = getNodePreviewRows(Type.PROCESSING_SET_PAYLOAD, keyTranslation, {
      data: {
        entries: [{ key: 'one', value: '1' }, {}, { key: 'three', value: '3' }, { key: 'hidden', value: '4' }],
      },
    });
    expect(rows[0]).toMatchObject({ value: 'one = 1,  = , three = 3' });
  });

  it('keeps variable fields separate and includes a configured source', () => {
    const rows = getNodePreviewRows(Type.INPUT_VARIABLE_CHANGED, keyTranslation, {
      data: {
        watches: [{ key: 'ready', scope: 'global' }, {}],
        source: 'exclude-self',
      },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      entries: [
        {
          fields: [
            { value: 'ready' },
            { value: 'nodes.input.variable.changed.config.watches.items.scope.enum.global' },
          ],
        },
        { fields: [{ value: '-' }, { value: '-' }] },
      ],
    });
    expect(rows[1]).toMatchObject({ value: 'nodes.input.variable.changed.config.source.enum.exclude-self' });
  });

  it('does not assign core preview content to plugin or prototype names', () => {
    for (const type of ['plugin.wago.output', '__proto__', 'toString'])
      expect(getNodePreviewRows(type, keyTranslation, null)).toEqual([]);
  });
});
