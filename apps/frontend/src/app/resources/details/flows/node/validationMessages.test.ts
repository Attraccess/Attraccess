import { describe, expect, it } from 'vitest';
import type { ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
import { validationMessages } from './validationMessages';

const t = (key: string, data?: Record<string, unknown>) =>
  key === 'validation.required'
    ? `${data?.field} is missing`
    : key === 'validation.invalid'
      ? `${data?.field}: ${data?.message}`
      : `label(${key})`;

const schema = (type: string, properties: Record<string, unknown> = {}) =>
  ({ type, configSchema: { properties } }) as unknown as ResourceFlowNodeSchemaDto;

describe('validationMessages', () => {
  const core = { schema: schema('core.node'), t, tExists: (key: string) => key.endsWith('.config.items.label') };

  it('labels a dotted path with its first segment, without calling the whole field missing', () => {
    expect(
      validationMessages([{ field: 'items.0.key', code: 'required', message: 'This field is required.' }], core),
    ).toEqual(['label(nodes.core.node.config.items.label): This field is required.']);
  });

  it('does not repeat a label the message already starts with', () => {
    const titled = { schema: schema('core.node', { duration: { title: 'Duration' } }), t, tExists: () => false };
    expect(
      validationMessages(
        [{ field: 'duration', code: 'invalid', message: 'Duration must be a positive integer' }],
        titled,
      ),
    ).toEqual(['Duration must be a positive integer']);
    expect(validationMessages([{ field: 'duration', code: 'invalid', message: 'Durations overlap' }], titled)).toEqual([
      'Duration: Durations overlap',
    ]);
  });

  it('prefers the schema title over the translation, like the node editor', () => {
    const titled = { schema: schema('core.node', { items: { title: 'Entries' } }), t, tExists: () => true };
    expect(validationMessages([{ field: 'items', code: 'required', message: 'x' }], titled)).toEqual([
      'Entries is missing',
    ]);
  });

  it('treats a missing code as invalid and shows unlabelled errors as they are', () => {
    expect(
      validationMessages(
        [
          { field: 'items', message: 'Too small' },
          { field: 'data', code: 'required', message: 'This field is required.' },
        ],
        core,
      ),
    ).toEqual(['label(nodes.core.node.config.items.label): Too small', 'This field is required.']);
  });

  it('uses the plugin schema title when the node has no translation', () => {
    const plugin = {
      schema: schema('plugin.x.node', { channelId: { title: 'Channel' }, other: {} }),
      t,
      tExists: () => false,
    };
    expect(
      validationMessages(
        [
          { field: 'channelId', message: 'Select an applied channel.' },
          { field: 'other', code: 'required', message: 'This field is required.' },
        ],
        plugin,
      ),
    ).toEqual(['Channel: Select an applied channel.', 'This field is required.']);
  });
});
