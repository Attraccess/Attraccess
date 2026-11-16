import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  editorHoldsFlowNodes,
  pickDefaultServerId as pickFromUses,
  readMqttNodes,
  suggestTopics as suggestFromUses,
  useMqttNodeUses,
} from './mqttNodes';

type EditorNodes = Parameters<typeof readMqttNodes>[0];
const pickDefaultServerId = (nodes: EditorNodes, list: Parameters<typeof pickFromUses>[1]) =>
  pickFromUses(readMqttNodes(nodes), list);
const suggestTopics = (nodes: EditorNodes, serverId: number) => suggestFromUses(readMqttNodes(nodes), serverId);

const mqtt = (type: string, serverId: unknown, topic?: unknown) => ({ type, data: { serverId, topic } });
const servers = [
  { id: 1, name: 'Zulu' },
  { id: 2, name: 'Alpha' },
  { id: 3, name: 'Mid' },
];

describe('readMqttNodes', () => {
  it('reads the three MQTT node types and ignores everything else', () => {
    const nodes = [
      mqtt('input.mqtt.message.received', 1, 'a'),
      mqtt('output.mqtt.sendMessage', 2, ' b '),
      mqtt('processing.mqtt.waitForMessage', 3, 'c'),
      { type: 'processing.if', data: { serverId: 9, topic: 'x' } },
      mqtt('output.mqtt.sendMessage', 'not-a-number', 'x'),
      mqtt('output.mqtt.sendMessage', 0, 'x'),
      { type: 'output.mqtt.sendMessage' },
    ];
    expect(readMqttNodes(nodes)).toEqual([
      { serverId: 1, topic: 'a' },
      { serverId: 2, topic: 'b' },
      { serverId: 3, topic: 'c' },
    ]);
  });
});

describe('useMqttNodeUses', () => {
  const placed = (x: number, topic = 'a') => [
    { type: 'output.mqtt.sendMessage', position: { x, y: 0 }, data: { serverId: 1, topic } },
    { type: 'processing.if', position: { x, y: 10 }, data: { anything: x } },
  ];

  it('keeps its identity while only positions and other nodes change, as on every drag frame', () => {
    const { result, rerender } = renderHook(({ nodes }) => useMqttNodeUses(nodes), {
      initialProps: { nodes: placed(0) },
    });
    const first = result.current;
    expect(first).toEqual([{ serverId: 1, topic: 'a' }]);
    rerender({ nodes: placed(50) });
    expect(result.current).toBe(first);

    rerender({ nodes: placed(50, 'b') });
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual([{ serverId: 1, topic: 'b' }]);
  });
});

describe('pickDefaultServerId', () => {
  it('picks the server most used by the current nodes', () => {
    const nodes = [
      mqtt('input.mqtt.message.received', 3, 'a'),
      mqtt('output.mqtt.sendMessage', 1, 'b'),
      mqtt('output.mqtt.sendMessage', 3, 'c'),
    ];
    expect(pickDefaultServerId(nodes, servers)).toBe(3);
  });

  it('falls back to the first server by name', () => {
    expect(pickDefaultServerId([], servers)).toBe(2);
    expect(pickDefaultServerId([{ type: 'processing.if', data: {} }], servers)).toBe(2);
  });

  it('ignores nodes that point to a server that no longer exists', () => {
    expect(pickDefaultServerId([mqtt('output.mqtt.sendMessage', 99, 'a')], servers)).toBe(2);
  });

  it('has no default without servers', () => {
    expect(pickDefaultServerId([mqtt('output.mqtt.sendMessage', 1, 'a')], [])).toBeNull();
  });
});

describe('suggestTopics', () => {
  const nodes = [
    mqtt('input.mqtt.message.received', 1, 'door/+/state'),
    mqtt('output.mqtt.sendMessage', 1, 'lamp/set'),
    mqtt('output.mqtt.sendMessage', 1, 'lamp/set'),
    mqtt('processing.mqtt.waitForMessage', 1, 'lamp/#'),
    mqtt('output.mqtt.sendMessage', 1, 'machine/{{resource.id}}/set'),
    mqtt('output.mqtt.sendMessage', 1, '{% if x %}a{% endif %}'),
    mqtt('output.mqtt.sendMessage', 1, 'bad/#/filter'),
    mqtt('output.mqtt.sendMessage', 1, ''),
    mqtt('output.mqtt.sendMessage', 2, 'other/server'),
  ];

  it('offers valid filters for watching and wildcard-free topics for publishing, from this server only', () => {
    expect(suggestTopics(nodes, 1)).toEqual({
      filters: ['door/+/state', 'lamp/set', 'lamp/#'],
      topics: ['lamp/set'],
    });
    expect(suggestTopics(nodes, 2)).toEqual({ filters: ['other/server'], topics: ['other/server'] });
    expect(suggestTopics(nodes, 3)).toEqual({ filters: [], topics: [] });
  });
});

describe('editorHoldsFlowNodes', () => {
  it('is not ready while the flow loads or before the editor has copied its nodes', () => {
    expect(editorHoldsFlowNodes({ isError: false, loaded: undefined, editorNodeCount: 0 })).toBe(false);
    expect(editorHoldsFlowNodes({ isError: false, loaded: { nodes: [{}, {}] }, editorNodeCount: 0 })).toBe(false);
  });

  it('is ready once the editor holds the nodes, for an empty flow, and after a failed load', () => {
    expect(editorHoldsFlowNodes({ isError: false, loaded: { nodes: [{}, {}] }, editorNodeCount: 2 })).toBe(true);
    expect(editorHoldsFlowNodes({ isError: false, loaded: { nodes: [] }, editorNodeCount: 0 })).toBe(true);
    expect(editorHoldsFlowNodes({ isError: true, loaded: undefined, editorNodeCount: 0 })).toBe(true);
  });
});
