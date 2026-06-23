// Tests for domain mapping: nodeTypeDomain, DOMAINS, and DOMAIN_ORDER
// FEATURE: Node catalog redesign — domain grouping
import { describe, expect, it } from 'vitest';
import { ResourceFlowNodeType } from '@attraccess/react-query-client';
import { DOMAINS, DOMAIN_ORDER, nodeTypeDomain, type Domain } from './domains';

const cases: Array<[ResourceFlowNodeType, Domain]> = [
  [ResourceFlowNodeType.INPUT_BUTTON, 'manual'],
  [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, 'resource'],
  [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED, 'resource'],
  [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER, 'resource'],
  [ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION, 'resource'],
  [ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY, 'resource'],
  [ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY, 'resource'],
  [ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_CALCULATION_SET_ADDITIONAL_ITEMS, 'resource'],
  [ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED, 'door'],
  [ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED, 'door'],
  [ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLATCHED, 'door'],
  [ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED, 'mqtt'],
  [ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE, 'mqtt'],
  [ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE, 'mqtt'],
  [ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST, 'http'],
  [ResourceFlowNodeType.PROCESSING_WAIT, 'logic'],
  [ResourceFlowNodeType.PROCESSING_IF, 'logic'],
  [ResourceFlowNodeType.PROCESSING_SET_PAYLOAD, 'logic'],
  [ResourceFlowNodeType.PROCESSING_ERROR, 'logic'],
  [ResourceFlowNodeType.PROCESSING_VARIABLES_SET, 'logic'],
  [ResourceFlowNodeType.PROCESSING_VARIABLES_GET, 'logic'],
  [ResourceFlowNodeType.INPUT_VARIABLE_CHANGED, 'logic'],
  [ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT, 'health'],
  [ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET, 'health'],
  [ResourceFlowNodeType.OUTPUT_COMPANION_LOCK_PC, 'companion'],
  [ResourceFlowNodeType.OUTPUT_COMPANION_UNLOCK_PC, 'companion'],
];

describe('nodeTypeDomain', () => {
  it.each(cases)('maps %s to its declared domain', (nodeType, expectedDomain) => {
    expect(nodeTypeDomain(nodeType)).toBe(expectedDomain);
  });

  it('cases cover every ResourceFlowNodeType value', () => {
    expect(cases.map(([t]) => t).sort()).toEqual(Object.values(ResourceFlowNodeType).sort());
  });
});

describe('DOMAIN_ORDER', () => {
  it('contains every domain referenced by the case table', () => {
    for (const [, domain] of cases) {
      expect(DOMAIN_ORDER).toContain(domain);
    }
  });
});

describe('DOMAINS', () => {
  it('defines an entry for every domain in DOMAIN_ORDER', () => {
    for (const domain of DOMAIN_ORDER) {
      expect(DOMAINS[domain]).toBeDefined();
    }
  });
});
