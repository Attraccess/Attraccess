import { ZxcvbnService } from './zxcvbn.service';

describe('ZxcvbnService', () => {
  const service = new ZxcvbnService();

  it('scores low for trivially weak passwords', () => {
    const result = service.evaluate('123456');
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('scores high for long passphrases', () => {
    const result = service.evaluate('correct-horse-battery-staple-99');
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it('penalizes when matching user inputs', () => {
    const result = service.evaluate('johndoe-johndoe-1', ['johndoe', 'johndoe@example.com']);
    expect(result.score).toBeLessThanOrEqual(2);
  });
});
