// Tests for domain mapping: nodeTypeDomain, DOMAINS, and DOMAIN_ORDER
// FEATURE: Node catalog redesign — domain grouping
import { describe, expect, it } from 'vitest';
import { ResourceFlowNodeType } from '@attraccess/react-query-client';
import { DOMAINS, DOMAIN_ORDER, nodeTypeDomain, type Domain } from './domains';

const cases: Array<[ResourceFlowNodeType, Domain]> = [
  [ResourceFlowNodeType.MANUAL_BUTTON, 'manual'],
  [ResourceFlowNodeType.RESOURCE_USAGE_STARTED, 'resource'],
  [ResourceFlowNodeType.RESOURCE_USAGE_STOPPED, 'resource'],
  [ResourceFlowNodeType.RESOURCE_USAGE_TAKEOVER, 'resource'],
  [ResourceFlowNodeType.RESOURCE_USAGE_END_SESSION, 'resource'],
  [ResourceFlowNodeType.RESOURCE_ACTIVITY_NO_ACTIVITY, 'resource'],
  [ResourceFlowNodeType.RESOURCE_ACTIVITY_TRACK_ACTIVITY, 'resource'],
  [ResourceFlowNodeType.RESOURCE_BILLING_SET_ADDITIONAL_ITEMS, 'resource'],
  [ResourceFlowNodeType.DOOR_UNLOCKED, 'door'],
  [ResourceFlowNodeType.DOOR_LOCKED, 'door'],
  [ResourceFlowNodeType.DOOR_UNLATCHED, 'door'],
  [ResourceFlowNodeType.MQTT_MESSAGE_RECEIVED, 'mqtt'],
  [ResourceFlowNodeType.MQTT_SEND_MESSAGE, 'mqtt'],
  [ResourceFlowNodeType.MQTT_WAIT_FOR_MESSAGE, 'mqtt'],
  [ResourceFlowNodeType.HTTP_SEND_REQUEST, 'http'],
  [ResourceFlowNodeType.LOGIC_WAIT, 'logic'],
  [ResourceFlowNodeType.LOGIC_IF, 'logic'],
  [ResourceFlowNodeType.LOGIC_SET_PAYLOAD, 'logic'],
  [ResourceFlowNodeType.LOGIC_ERROR, 'logic'],
  [ResourceFlowNodeType.HEALTH_HEARTBEAT, 'health'],
  [ResourceFlowNodeType.HEALTH_SET, 'health'],
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
