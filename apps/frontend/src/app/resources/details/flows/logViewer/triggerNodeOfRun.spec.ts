import { describe, expect, it } from 'vitest';
import { triggerNodeOfRun } from './index';
import { ResourceFlowNodeDto } from '@attraccess/react-query-client';

const node = (type: string) => ({ id: type, type, position: { x: 0, y: 0 }, data: {} }) as ResourceFlowNodeDto;

describe('triggerNodeOfRun', () => {
  it('picks the trigger, not the synthetic flow.start or the newest node', () => {
    // newest-first, as rendered
    const logs = [
      { node: node('output.http.sendRequest') },
      { node: node('input.mqtt.message.received') },
      { node: undefined }, // flow.start
    ];

    expect(triggerNodeOfRun(logs)?.type).toBe('input.mqtt.message.received');
  });

  it('returns undefined when only flow.start has been recorded yet', () => {
    expect(triggerNodeOfRun([{ node: undefined }])).toBeUndefined();
  });
});
