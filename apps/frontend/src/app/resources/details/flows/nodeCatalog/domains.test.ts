// Tests for domain mapping: nodeTypeDomain, getDomainDef, getPluginDomainLabel, DOMAINS, and DOMAIN_ORDER
// FEATURE: Node catalog redesign — domain grouping
import { describe, expect, it } from 'vitest';
import { DOMAINS, DOMAIN_ORDER, getDomainDef, getPluginDomainLabel, nodeTypeDomain, type Domain } from './domains';

const cases: Array<[string, Domain]> = [
  ['input.button', 'flow-control'],
  ['input.resource.usage.started', 'usage-sessions'],
  ['input.resource.usage.stopped', 'usage-sessions'],
  ['input.resource.usage.takeover', 'usage-sessions'],
  ['output.resource.usage.end-session', 'usage-sessions'],
  ['output.resource.activity.operating', 'operation-activity'],
  ['output.resource.activity.idle', 'operation-activity'],
  ['input.resource.activity.no-activity', 'operation-activity'],
  ['output.resource.activity.track-activity', 'operation-activity'],
  ['output.resource.billing.calculation.set-additional-items', 'billing'],
  ['input.resource.door.unlocked', 'access-doors'],
  ['input.resource.door.locked', 'access-doors'],
  ['input.resource.door.unlatched', 'access-doors'],
  ['input.mqtt.message.received', 'messaging'],
  ['output.mqtt.sendMessage', 'messaging'],
  ['processing.mqtt.waitForMessage', 'messaging'],
  ['output.http.sendRequest', 'web-requests'],
  ['processing.wait', 'flow-control'],
  ['processing.if', 'flow-control'],
  ['processing.set-payload', 'flow-control'],
  ['processing.error', 'flow-control'],
  ['processing.variables.set', 'flow-control'],
  ['processing.variables.get', 'flow-control'],
  ['input.variable.changed', 'flow-control'],
  ['output.resource.health.heartbeat', 'health-monitoring'],
  ['output.resource.health.set', 'health-monitoring'],
  ['output.companion.lock-pc', 'companion-device'],
  ['output.companion.unlock-pc', 'companion-device'],
  ['input.companion.idle', 'companion-device'],
  ['input.companion.active', 'companion-device'],
  ['input.companion.foreground_app_changed', 'companion-device'],
  ['input.companion.usb_device_connected', 'companion-device'],
  ['input.companion.usb_device_disconnected', 'companion-device'],
];

describe('nodeTypeDomain', () => {
  it.each(cases)('maps %s to its declared domain', (nodeType, expectedDomain) => {
    expect(nodeTypeDomain(nodeType)).toBe(expectedDomain);
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
