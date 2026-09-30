import { getExternalEffectFailureBehavior, getNodeDataSchema, ResourceFlowNodeType as Type } from './resourceFlowNode';

describe('resource flow node schemas', () => {
  it.each(Object.values(Type))('provides a usable schema for %s', (type) => {
    expect(typeof getNodeDataSchema(type).safeParse).toBe('function');
  });

  it('rejects unknown and prototype-property node types', () => {
    for (const input of ['unknown', '__proto__', 'toString']) {
      expect(() => getNodeDataSchema(input as Type)).toThrow(`Unknown node type: ${input}`);
    }
  });

  it('preserves event nodes without data and validates wait and button data', () => {
    expect(getNodeDataSchema(Type.INPUT_RESOURCE_USAGE_STARTED).safeParse(undefined).success).toBe(true);
    expect(getNodeDataSchema(Type.INPUT_BUTTON).safeParse({ label: '' }).success).toBe(false);
    expect(getNodeDataSchema(Type.INPUT_BUTTON).safeParse({ label: 'Start' }).success).toBe(true);
    expect(getNodeDataSchema(Type.PROCESSING_WAIT).safeParse({ duration: -1, unit: 'seconds' }).success).toBe(false);
    expect(getNodeDataSchema(Type.PROCESSING_WAIT).safeParse({ duration: 1, unit: 'seconds' }).success).toBe(true);
  });

  it.each([
    [Type.OUTPUT_HTTP_SEND_REQUEST, { url: 'https://example.test', method: 'GET' }],
    [Type.OUTPUT_MQTT_SEND_MESSAGE, { serverId: 1, topic: 'command' }],
    [Type.PROCESSING_MQTT_WAIT_FOR_MESSAGE, { serverId: 1, topic: 'reply', timeoutSeconds: 5 }],
    [Type.OUTPUT_RESOURCE_USAGE_END_SESSION, {}],
  ])('validates explicit failure policies for %s', (type, data) => {
    for (const behavior of ['fail-flow', 'failure-output', 'log-and-continue']) {
      expect(getExternalEffectFailureBehavior(type, { ...data, failureBehavior: behavior })).toBe(behavior);
    }
    expect(getExternalEffectFailureBehavior(type, { ...data, failureBehavior: 'unknown' })).toBeUndefined();
    expect(getExternalEffectFailureBehavior(type, data)).toBeUndefined();
  });

  it.each([null, undefined, 'fail-flow', 1, {}])('ignores missing policy in %p', (data) => {
    expect(getExternalEffectFailureBehavior(Type.OUTPUT_HTTP_SEND_REQUEST, data)).toBeUndefined();
  });

  it('ignores policies for nodes without external effects and invalid request payloads', () => {
    expect(getExternalEffectFailureBehavior(Type.INPUT_BUTTON, { failureBehavior: 'fail-flow' })).toBeUndefined();
    expect(
      getExternalEffectFailureBehavior(Type.OUTPUT_HTTP_SEND_REQUEST, { failureBehavior: 'fail-flow' }),
    ).toBeUndefined();
  });
});
