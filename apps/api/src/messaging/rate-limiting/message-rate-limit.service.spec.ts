import { MessageRateLimitService } from './message-rate-limit.service';
import { MessageRateLimitExceededException } from './message-rate-limit.exception';

describe('MessageRateLimitService', () => {
  let service: MessageRateLimitService;
  let now: number;

  beforeEach(() => {
    service = new MessageRateLimitService();
    now = 1_000_000;
    // Deterministic clock and small limits for the test.
    (service as unknown as { nowFn: () => number }).nowFn = () => now;
    (service as unknown as { limits: Record<string, { maxActions: number; windowSeconds: number }> }).limits = {
      send_message: { maxActions: 3, windowSeconds: 60 },
      contact: { maxActions: 2, windowSeconds: 60 },
    };
  });

  it('allows actions up to the configured limit', () => {
    expect(() => service.assertWithinLimit('send_message', 1)).not.toThrow();
    expect(() => service.assertWithinLimit('send_message', 1)).not.toThrow();
    expect(() => service.assertWithinLimit('send_message', 1)).not.toThrow();
  });

  it('throws a 429 once the limit is exceeded within the window', () => {
    for (let i = 0; i < 3; i += 1) {
      service.assertWithinLimit('send_message', 1);
    }
    expect(() => service.assertWithinLimit('send_message', 1)).toThrow(MessageRateLimitExceededException);
  });

  it('exposes a positive retryAfterSeconds on the exception', () => {
    for (let i = 0; i < 3; i += 1) {
      service.assertWithinLimit('send_message', 1);
    }
    try {
      service.assertWithinLimit('send_message', 1);
      fail('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(MessageRateLimitExceededException);
      expect((error as MessageRateLimitExceededException).retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('resets after the window elapses', () => {
    for (let i = 0; i < 3; i += 1) {
      service.assertWithinLimit('send_message', 1);
    }
    expect(() => service.assertWithinLimit('send_message', 1)).toThrow(MessageRateLimitExceededException);

    now += 60_000; // advance past the window
    expect(() => service.assertWithinLimit('send_message', 1)).not.toThrow();
  });

  it('tracks limits independently per user', () => {
    for (let i = 0; i < 3; i += 1) {
      service.assertWithinLimit('send_message', 1);
    }
    expect(() => service.assertWithinLimit('send_message', 1)).toThrow(MessageRateLimitExceededException);
    // A different user is unaffected.
    expect(() => service.assertWithinLimit('send_message', 2)).not.toThrow();
  });

  it('tracks limits independently per scope', () => {
    service.assertWithinLimit('contact', 1);
    service.assertWithinLimit('contact', 1);
    expect(() => service.assertWithinLimit('contact', 1)).toThrow(MessageRateLimitExceededException);
    // The send_message scope for the same user still has budget.
    expect(() => service.assertWithinLimit('send_message', 1)).not.toThrow();
  });
});
