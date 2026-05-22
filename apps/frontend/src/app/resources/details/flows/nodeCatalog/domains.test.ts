// Tests for domain mapping: nodeTypeDomain, DOMAINS, and DOMAIN_ORDER
// FEATURE: Node catalog redesign — domain grouping
import { describe, expect, it } from 'vitest';
import { ResourceFlowNodeType } from '@attraccess/react-query-client';
import { DOMAINS, DOMAIN_ORDER, nodeTypeDomain, type Domain } from './domains';

describe('nodeTypeDomain', () => {
  it.each(Object.values(ResourceFlowNodeType))('returns first segment for %s', (nodeType) => {
    const expected = nodeType.split('.')[0] as Domain;
    expect(nodeTypeDomain(nodeType)).toBe(expected);
    expect(DOMAIN_ORDER).toContain(expected);
  });
});

describe('DOMAINS', () => {
  it('defines an entry for every domain in DOMAIN_ORDER', () => {
    for (const domain of DOMAIN_ORDER) {
      expect(DOMAINS[domain]).toBeDefined();
    }
  });
});
