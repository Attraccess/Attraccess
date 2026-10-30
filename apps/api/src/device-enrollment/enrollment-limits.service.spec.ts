import { EnrollmentLimitsService } from './enrollment-limits.service';
import { EnrollmentRateLimitedException } from './enrollment-rate-limited.exception';

describe('EnrollmentLimitsService', () => {
  let limits: EnrollmentLimitsService;
  beforeEach(() => {
    limits = new EnrollmentLimitsService();
  });

  it('allows 3 attempts per connection per minute and then asks to wait', () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(limits.admit('c1', `10.0.0.${i + 1}`, t).allowed).toBe(true);
    const refused = limits.admit('c1', '10.0.0.9', t + 1000);
    expect(refused.allowed).toBe(false);
    expect(refused.reason).toBe('RATE_LIMITED');
    expect(refused.retryAfterMs).toBeGreaterThan(0);
    expect(limits.admit('c1', '10.0.0.9', t + 61_000).allowed).toBe(true);
  });

  it('allows 10 attempts per client address in 10 minutes', () => {
    const t = 5_000_000;
    for (let i = 0; i < 10; i++) expect(limits.admit(`conn-${i}`, '192.168.1.5', t).allowed).toBe(true);
    expect(limits.admit('conn-x', '192.168.1.5', t + 1000).allowed).toBe(false);
    expect(limits.admit('conn-y', '192.168.1.6', t + 1000).allowed).toBe(true);
  });

  it('buckets IPv6 clients by /64', () => {
    const t = 1;
    for (let i = 0; i < 10; i++) limits.admit(`c${i}`, `2001:db8:0:1::${i + 1}`, t);
    expect(limits.admit('cx', '2001:db8:0:1:aaaa::1', t).allowed).toBe(false);
  });

  it('holds 20 pending per address and 200 in total', () => {
    for (let i = 0; i < 20; i++) expect(limits.reservePending(`r${i}`, '10.1.1.1')).toBe(true);
    expect(limits.reservePending('over', '10.1.1.1')).toBe(false);
    limits.releasePending('r0');
    expect(limits.reservePending('again', '10.1.1.1')).toBe(true);

    const total = new EnrollmentLimitsService();
    for (let i = 0; i < 200; i++) expect(total.reservePending(`t${i}`, `10.2.${Math.floor(i / 20)}.${i % 20}`)).toBe(true);
    expect(total.reservePending('t200', '10.9.9.9')).toBe(false);
    expect(total.pendingCount).toBe(200);
  });

  it('throttles an approver after 5 wrong codes per minute with retry-after', () => {
    const t = 9_000_000;
    for (let i = 0; i < 5; i++) {
      limits.assertApproverAllowed(7, t);
      limits.recordWrongCode(7, t);
    }
    expect(() => limits.assertApproverAllowed(7, t + 1000)).toThrow(EnrollmentRateLimitedException);
    expect(() => limits.assertApproverAllowed(8, t + 1000)).not.toThrow();
    expect(() => limits.assertApproverAllowed(7, t + 61_000)).not.toThrow();
    limits.clearApprover(7);
  });
});
