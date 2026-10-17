import { validate } from 'class-validator';
import { ExactlyOneOf } from './exactly-one-of.validator';

class MaintenanceInterval {
  @ExactlyOneOf(['days', 'hours'])
  days?: unknown;
  hours?: unknown;
}

describe('maintenance interval selection', () => {
  it.each([
    [1, undefined, true],
    [null, 5, true],
    ['2', '', true],
    [0, 2, true],
    [-1, 2, true],
    [2, 3, false],
    [undefined, undefined, false],
    [null, '', false],
    [0, 0, false],
    ['invalid', -2, false],
    [NaN, 3, true],
  ])('validates days=%p and hours=%p', async (days, hours, valid) => {
    const interval = Object.assign(new MaintenanceInterval(), { days, hours });
    const errors = await validate(interval);
    expect(errors.length === 0).toBe(valid);
    if (!valid) {
      expect(errors[0].constraints).toEqual({
        exactlyOneOf: 'Exactly one of days or hours must be set (and positive).',
      });
    }
  });
});
