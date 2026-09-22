import { ResourceFlowNodeType as Type, ResourceType } from '@attraccess/database-entities';
import { getCoreNodeSchemas } from './core-node-schemas';

describe('core flow node catalog', () => {
  it.each([ResourceType.Machine, ResourceType.Door])('covers every node exactly once for %s', (resourceType) => {
    const schemas = getCoreNodeSchemas(resourceType);
    expect(schemas.map((schema) => schema.type).sort()).toEqual(Object.values(Type).sort());
    expect(schemas.every((schema) => schema.configSchema !== undefined)).toBe(true);
  });

  it('limits machine and door actions while retaining shared processing and external effects', () => {
    const machine = new Map(getCoreNodeSchemas(ResourceType.Machine).map((schema) => [schema.type, schema]));
    const door = new Map(getCoreNodeSchemas(ResourceType.Door).map((schema) => [schema.type, schema]));
    for (const type of [Type.INPUT_BUTTON, Type.INPUT_RESOURCE_USAGE_STARTED, Type.OUTPUT_RESOURCE_USAGE_END_SESSION]) {
      expect(machine.get(type).supportedByResource).toBe(true);
      expect(door.get(type).supportedByResource).toBe(false);
    }
    expect(machine.get(Type.INPUT_RESOURCE_DOOR_UNLOCKED).supportedByResource).toBe(false);
    expect(door.get(Type.INPUT_RESOURCE_DOOR_UNLOCKED).supportedByResource).toBe(true);
    for (const type of [Type.PROCESSING_WAIT, Type.OUTPUT_HTTP_SEND_REQUEST, Type.OUTPUT_MQTT_SEND_MESSAGE]) {
      expect(machine.get(type).supportedByResource).toBe(true);
      expect(door.get(type).supportedByResource).toBe(true);
    }
  });

  it('preserves failure, conditional, terminal and event ports', () => {
    const schemas = new Map(getCoreNodeSchemas(ResourceType.Machine).map((schema) => [schema.type, schema]));
    expect(schemas.get(Type.OUTPUT_HTTP_SEND_REQUEST)).toMatchObject({
      inputs: ['input'],
      outputs: ['output', 'failure'],
      isOutput: true,
    });
    expect(schemas.get(Type.PROCESSING_IF)).toMatchObject({
      inputs: ['input'],
      outputs: ['output-true', 'output-false'],
      isOutput: false,
    });
    expect(schemas.get(Type.PROCESSING_ERROR)).toMatchObject({ inputs: ['input'], outputs: [] });
    expect(schemas.get(Type.INPUT_VARIABLE_CHANGED)).toMatchObject({ inputs: [], outputs: ['output'], isInput: false });
    expect(schemas.get(Type.INPUT_BUTTON).configSchema).toMatchObject({ required: ['label'] });
  });

  it('returns independent port arrays to callers', () => {
    const first = getCoreNodeSchemas(ResourceType.Machine);
    first.find((schema) => schema.type === Type.PROCESSING_WAIT).outputs.push('mutated');
    expect(
      getCoreNodeSchemas(ResourceType.Machine).find((schema) => schema.type === Type.PROCESSING_WAIT).outputs,
    ).toEqual(['output']);
  });
});
