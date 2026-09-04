// Tests for domain mapping: nodeTypeDomain, getDomainDef, getPluginDomainLabel, DOMAINS, and DOMAIN_ORDER
// FEATURE: Node catalog redesign — domain grouping
import { describe, expect, it } from 'vitest';
import { ResourceFlowNodeType } from '@attraccess/react-query-client';
import { DOMAINS, DOMAIN_ORDER, getDomainDef, getPluginDomainLabel, nodeTypeDomain, type Domain } from './domains';

const cases: Array<[ResourceFlowNodeType, Domain]> = [
  [ResourceFlowNodeType.INPUT_BUTTON, 'flow-control'],
  [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, 'usage-sessions'],
  [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED, 'usage-sessions'],
  [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER, 'usage-sessions'],
  [ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION, 'usage-sessions'],
  [ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_OPERATING, 'operation-activity'],
  [ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_IDLE, 'operation-activity'],
  [ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY, 'operation-activity'],
  [ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY, 'operation-activity'],
  [ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_CALCULATION_SET_ADDITIONAL_ITEMS, 'billing'],
  [ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED, 'access-doors'],
  [ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED, 'access-doors'],
  [ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLATCHED, 'access-doors'],
  [ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED, 'messaging'],
  [ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE, 'messaging'],
  [ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE, 'messaging'],
  [ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST, 'web-requests'],
  [ResourceFlowNodeType.PROCESSING_WAIT, 'flow-control'],
  [ResourceFlowNodeType.PROCESSING_IF, 'flow-control'],
  [ResourceFlowNodeType.PROCESSING_SET_PAYLOAD, 'flow-control'],
  [ResourceFlowNodeType.PROCESSING_ERROR, 'flow-control'],
  [ResourceFlowNodeType.PROCESSING_VARIABLES_SET, 'flow-control'],
  [ResourceFlowNodeType.PROCESSING_VARIABLES_GET, 'flow-control'],
  [ResourceFlowNodeType.INPUT_VARIABLE_CHANGED, 'flow-control'],
  [ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT, 'health-monitoring'],
  [ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET, 'health-monitoring'],
  [ResourceFlowNodeType.OUTPUT_COMPANION_LOCK_PC, 'companion-device'],
  [ResourceFlowNodeType.OUTPUT_COMPANION_UNLOCK_PC, 'companion-device'],
  [ResourceFlowNodeType.INPUT_COMPANION_IDLE, 'companion-device'],
  [ResourceFlowNodeType.INPUT_COMPANION_ACTIVE, 'companion-device'],
  [ResourceFlowNodeType.INPUT_COMPANION_FOREGROUND_APP_CHANGED, 'companion-device'],
  [ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_CONNECTED, 'companion-device'],
  [ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_DISCONNECTED, 'companion-device'],
];

describe('nodeTypeDomain', () => {
  it.each(cases)('maps %s to its declared domain', (nodeType, expectedDomain) => {
    expect(nodeTypeDomain(nodeType)).toBe(expectedDomain);
  });

  it('maps every core node type to an approved domain', () => {
    expect(cases.map(([nodeType]) => nodeType).sort()).toEqual(Object.values(ResourceFlowNodeType).sort());
  });

  it('maps plugin nodes to a per-plugin domain', () => {
    expect(nodeTypeDomain('plugin.shelly.send-on')).toBe('plugin.shelly');
    expect(nodeTypeDomain('plugin.homeassistant.turn-on')).toBe('plugin.homeassistant');
  });
});

describe('DOMAIN_ORDER', () => {
  it('contains every core domain referenced by the case table', () => {
    for (const [, domain] of cases) {
      expect(DOMAIN_ORDER).toContain(domain);
    }
  });

  it('does not contain the generic plugin domain (plugins get per-plugin domains)', () => {
    expect(DOMAIN_ORDER).not.toContain('plugin');
  });
});

describe('DOMAINS', () => {
  it('defines an entry for every domain in DOMAIN_ORDER', () => {
    for (const domain of DOMAIN_ORDER) {
      expect(DOMAINS[domain]).toBeDefined();
    }
  });
});

describe('getDomainDef', () => {
  it('returns the correct def for a known domain', () => {
    expect(getDomainDef('flow-control')).toBe(DOMAINS['flow-control']);
  });

  it('returns the plugin fallback def for an unknown plugin domain', () => {
    const def = getDomainDef('plugin.shelly');
    expect(def).toBeDefined();
    expect(def.icon).toBeDefined();
  });
});

describe('getPluginDomainLabel', () => {
  it('capitalises the plugin name from a plugin domain', () => {
    expect(getPluginDomainLabel('plugin.shelly')).toBe('Shelly');
    expect(getPluginDomainLabel('plugin.homeassistant')).toBe('Homeassistant');
  });

  it('returns null for static core domains', () => {
    expect(getPluginDomainLabel('flow-control')).toBeNull();
    expect(getPluginDomainLabel('billing')).toBeNull();
  });
});
