// Tests for domain mapping: schemaToDomain, DOMAINS, and DOMAIN_ORDER
// FEATURE: Node catalog redesign — domain grouping
import { describe, it, expect } from 'vitest';
import { ResourceFlowNodeType } from '@attraccess/react-query-client';
import { schemaToDomain, DOMAINS, DOMAIN_ORDER } from './domains';

describe('schemaToDomain', () => {
  it.each([
    [ResourceFlowNodeType.INPUT_BUTTON, 'manual'],
    [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, 'resource'],
    [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED, 'resource'],
    [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER, 'resource'],
    [ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY, 'resource'],
    [ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION, 'resource'],
    [ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_CALCULATION_SET_ADDITIONAL_ITEMS, 'resource'],
    [ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY, 'resource'],
    [ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED, 'door'],
    [ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED, 'door'],
    [ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLATCHED, 'door'],
    [ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED, 'mqtt'],
    [ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE, 'mqtt'],
    [ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE, 'mqtt'],
    [ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST, 'http'],
    [ResourceFlowNodeType.PROCESSING_WAIT, 'logic'],
    [ResourceFlowNodeType.PROCESSING_IF, 'logic'],
    [ResourceFlowNodeType.PROCESSING_SET_PAYLOAD, 'logic'],
    [ResourceFlowNodeType.PROCESSING_ERROR, 'logic'],
    [ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT, 'health'],
    [ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET, 'health'],
  ])('maps %s to %s', (nodeType, expectedDomain) => {
    expect(schemaToDomain(nodeType)).toBe(expectedDomain);
  });
});

describe('DOMAIN_ORDER', () => {
  it('lists all seven domains in display order', () => {
    expect(DOMAIN_ORDER).toEqual(['manual', 'resource', 'door', 'mqtt', 'http', 'logic', 'health']);
  });
});

describe('DOMAINS', () => {
  it('defines color + icon for every domain', () => {
    for (const key of DOMAIN_ORDER) {
      expect(DOMAINS[key]).toMatchObject({
        color: expect.any(String),
        iconBg: expect.any(String),
        iconFg: expect.any(String),
        icon: expect.anything(),
      });
    }
  });

  it('has the same domain keys as DOMAIN_ORDER', () => {
    expect(Object.keys(DOMAINS).sort()).toEqual([...DOMAIN_ORDER].sort());
  });
});
