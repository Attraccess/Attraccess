import { RunLed } from './status-led';

describe('RunLed', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('drives yellow as both dies, writes only changes, and stops dark', () => {
    const writes: string[] = [];
    const led = new RunLed((die, value) => writes.push(`${die}=${value}`));
    led.set('starting');
    expect(writes).toEqual(['green=1', 'red=1']);
    led.set('disconnected');
    expect(writes.slice(2)).toEqual(['green=0']);
    jest.advanceTimersByTime(500);
    expect(writes.slice(3)).toEqual(['red=0']);
    led.stop();
    led.set('disconnected');
    jest.advanceTimersByTime(5000);
    expect(writes.slice(4)).toEqual([]);
  });

  it('disables itself on write failure instead of throwing', () => {
    const write = jest.fn(() => {
      throw new Error('EACCES');
    });
    const stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
    const led = new RunLed(write);
    expect(() => led.set('ready')).not.toThrow();
    jest.advanceTimersByTime(60_000);
    led.set('fault');
    expect(write).toHaveBeenCalledTimes(1);
    expect(stderr).toHaveBeenCalledTimes(1);
    stderr.mockRestore();
  });
});
