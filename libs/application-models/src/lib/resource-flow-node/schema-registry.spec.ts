import { ResourceFlowNodeType } from '../node-type';
import { getExternalEffectFailureBehavior, getNodeDataSchema } from './schema-registry';

describe('node data schema registry', () => {
  it('has a schema for every core node type', () => {
    for (const type of Object.values(ResourceFlowNodeType)) {
      expect(getNodeDataSchema(type)).toBeDefined();
    }
  });

  it('rejects unknown node types', () => {
    expect(() => getNodeDataSchema('plugin.x.y' as ResourceFlowNodeType)).toThrow('Unknown node type');
  });

  describe('getExternalEffectFailureBehavior', () => {
    it('is undefined without data or without a failureBehavior key', () => {
      expect(getExternalEffectFailureBehavior(ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST, null)).toBeUndefined();
      expect(getExternalEffectFailureBehavior(ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST, 'x')).toBeUndefined();
      expect(getExternalEffectFailureBehavior(ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST, {})).toBeUndefined();
    });

    it('reads the behavior of nodes with an external effect', () => {
      const data = { failureBehavior: 'fail-flow' };
      expect(
        getExternalEffectFailureBehavior(ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST, {
          ...data,
          url: 'https://example.com',
          method: 'GET',
        }),
      ).toBe('fail-flow');
      expect(
        getExternalEffectFailureBehavior(ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE, {
          ...data,
          serverId: 1,
          topic: 't',
          message: 'm',
        }),
      ).toBe('fail-flow');
    });

    it('is undefined for invalid data and for nodes without an external effect policy', () => {
      expect(
        getExternalEffectFailureBehavior(ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST, { failureBehavior: 'bogus' }),
      ).toBeUndefined();
      expect(
        getExternalEffectFailureBehavior(ResourceFlowNodeType.PROCESSING_WAIT, { failureBehavior: 'fail-flow' }),
      ).toBeUndefined();
    });

    it('covers the wait-for-message and end-session nodes', () => {
      for (const type of [
        ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE,
        ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION,
      ]) {
        expect(getExternalEffectFailureBehavior(type, { failureBehavior: 'bogus' })).toBeUndefined();
      }
    });
  });
});
