import { MessageRateLimitService } from './message-rate-limit.service';
import { MessageRateLimitExceededException } from './message-rate-limit.exception';
import { MessagingRateLimitPolicy } from '../../settings/constants';
import { SettingsService } from '../../settings/settings.service';

describe('MessageRateLimitService', () => {
  let service: MessageRateLimitService;
  let now: number;
  // Small limits for the test: 3 sends / window, 2 contacts / window.
  const policy: MessagingRateLimitPolicy = {
    sendMaxPerWindow: 3,
    sendWindowSeconds: 60,
    contactMaxPerWindow: 2,
    contactWindowSeconds: 60,
  };

  beforeEach(() => {
    const settingsService = {
      getMessagingRateLimitPolicy: jest.fn().mockResolvedValue(policy),
    } as unknown as SettingsService;
    service = new MessageRateLimitService(settingsService);
    now = 1_000_000;
    // Deterministic clock.
    (service as unknown as { nowFn: () => number }).nowFn = () => now;
  });

  it('allows actions up to the configured limit', async () => {
    await expect(service.assertWithinLimit('send_message', 1)).resolves.toBeUndefined();
    await expect(service.assertWithinLimit('send_message', 1)).resolves.toBeUndefined();
    await expect(service.assertWithinLimit('send_message', 1)).resolves.toBeUndefined();
  });

  it('throws a 429 once the limit is exceeded within the window', async () => {
    for (let i = 0; i < 3; i += 1) {
      await service.assertWithinLimit('send_message', 1);
    }
    await expect(service.assertWithinLimit('send_message', 1)).rejects.toBeInstanceOf(
      MessageRateLimitExceededException,
    );
  });

  it('exposes a positive retryAfterSeconds on the exception', async () => {
    for (let i = 0; i < 3; i += 1) {
      await service.assertWithinLimit('send_message', 1);
    }
    try {
      await service.assertWithinLimit('send_message', 1);
      fail('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(MessageRateLimitExceededException);
      expect((error as MessageRateLimitExceededException).retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('resets after the window elapses', async () => {
    for (let i = 0; i < 3; i += 1) {
      await service.assertWithinLimit('send_message', 1);
    }
    await expect(service.assertWithinLimit('send_message', 1)).rejects.toBeInstanceOf(
      MessageRateLimitExceededException,
    );

    now += 60_000; // advance past the window
    await expect(service.assertWithinLimit('send_message', 1)).resolves.toBeUndefined();
  });

  it('tracks limits independently per user', async () => {
    for (let i = 0; i < 3; i += 1) {
      await service.assertWithinLimit('send_message', 1);
    }
    await expect(service.assertWithinLimit('send_message', 1)).rejects.toBeInstanceOf(
      MessageRateLimitExceededException,
    );
    // A different user is unaffected.
    await expect(service.assertWithinLimit('send_message', 2)).resolves.toBeUndefined();
  });

  it('tracks limits independently per scope', async () => {
    await service.assertWithinLimit('contact', 1);
    await service.assertWithinLimit('contact', 1);
    await expect(service.assertWithinLimit('contact', 1)).rejects.toBeInstanceOf(
      MessageRateLimitExceededException,
    );
    // The send_message scope for the same user still has budget.
    await expect(service.assertWithinLimit('send_message', 1)).resolves.toBeUndefined();
  });
});
