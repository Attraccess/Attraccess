import { HttpException } from '@nestjs/common';
import { ApiTokenRequestRateLimitService } from './api-token-request-rate-limit.service';

describe('ApiTokenRequestRateLimitService', () => {
  it('keeps token request counters separate', () => {
    const service = new ApiTokenRequestRateLimitService();

    for (let request = 0; request < 1_000; request += 1) {
      service.assertWithinLimit(1);
    }

    expect(() => service.assertWithinLimit(1)).toThrow(HttpException);
    expect(() => service.assertWithinLimit(2)).not.toThrow();
  });
});
