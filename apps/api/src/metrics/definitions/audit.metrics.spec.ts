import { Registry } from 'prom-client';
import { CORE_AUDIT_DOMAINS } from '../../audit/policies/domains';
import { AUDIT_DROP_REASONS, createAuditMetrics } from './audit.metrics';

describe('createAuditMetrics', () => {
  it('exposes a zero series for every core domain and reason before the first drop', async () => {
    const registry = new Registry();
    createAuditMetrics(registry);

    const lines = (await registry.metrics()).split('\n');
    const series = lines.filter((line) => line.startsWith('attraccess_audit_records_dropped_total{'));

    expect(series).toHaveLength((CORE_AUDIT_DOMAINS.length + 1) * AUDIT_DROP_REASONS.length);
    expect(series.every((line) => line.endsWith(' 0'))).toBe(true);
    expect(series).toContain('attraccess_audit_records_dropped_total{domain="unknown",reason="invalid_event"} 0');
  });
});
