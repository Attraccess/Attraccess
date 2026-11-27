import type { SecureConversionStatusDto } from '@attraccess/react-query-client';
import { eligibilityNeeded, IDLE_POLL_MS, POLL_INTERVAL_MS, statusPollInterval } from './conversionStates';

const status = (state: string | null) =>
  ({
    conversion: state ? { state } : null,
    online: true,
    canCancel: false,
    canRetry: false,
  }) as unknown as SecureConversionStatusDto;

describe('statusPollInterval', () => {
  it.each(['preflight', 'transferring', 'digests-burned', 'bootloader-written', 'encrypting', 'migrating'])(
    'polls fast while the reader works on %s',
    (state) => {
      expect(statusPollInterval(status(state), false)).toBe(POLL_INTERVAL_MS);
    },
  );

  it('polls at the idle interval while an interrupted reader may come back', () => {
    expect(statusPollInterval(status('interrupted'), false)).toBe(IDLE_POLL_MS);
  });

  it.each(['secured', 'failed', 'cancelled'])('stops once the conversion %s', (state) => {
    expect(statusPollInterval(status(state), false)).toBe(false);
  });

  it('polls at the idle interval without a conversion, and not at all for a secured reader', () => {
    expect(statusPollInterval(status(null), false)).toBe(IDLE_POLL_MS);
    expect(statusPollInterval(undefined, false)).toBe(IDLE_POLL_MS);
    expect(statusPollInterval(status(null), true)).toBe(false);
  });
});

describe('eligibilityNeeded', () => {
  it('is needed only while the button can show', () => {
    expect(eligibilityNeeded(status(null), false)).toBe(true);
    expect(eligibilityNeeded(status('failed'), false)).toBe(true);
    expect(eligibilityNeeded(status('transferring'), false)).toBe(false);
    expect(eligibilityNeeded(status('interrupted'), false)).toBe(false);
    expect(eligibilityNeeded(status(null), true)).toBe(false);
  });
});
