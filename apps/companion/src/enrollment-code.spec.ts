import { createEnrollmentCode, EnrollmentCodeRotation } from './enrollment-code';

describe('local enrollment codes', () => {
  afterEach(() => jest.useRealTimers());
  it('generates uppercase alphanumeric codes with cryptographic entropy', () => {
    const values = new Set(Array.from({ length: 100 }, createEnrollmentCode));
    expect(values.size).toBe(100);
    for (const value of values) expect(value).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  });
  it('rotates on a monotonic 30 second boundary and stops on disconnect', () => {
    jest.useFakeTimers();
    const publish = jest.fn();
    const rotation = new EnrollmentCodeRotation();
    rotation.start(publish);
    jest.advanceTimersByTime(29999);
    expect(publish).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(publish).toHaveBeenCalledTimes(2);
    rotation.stop();
    jest.advanceTimersByTime(60000);
    expect(publish).toHaveBeenCalledTimes(2);
  });
});
