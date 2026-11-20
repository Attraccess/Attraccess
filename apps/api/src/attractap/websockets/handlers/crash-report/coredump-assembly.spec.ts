import { crc32 } from 'zlib';
import { COREDUMP_MAX_BYTES, CoredumpAssemblies, declaredCoredump } from './coredump-assembly';

describe('CoredumpAssemblies', () => {
  afterEach(() => jest.useRealTimers());

  it('drops an upload that stalls and reports it', () => {
    jest.useFakeTimers();
    const expired = jest.fn();
    const assemblies = new CoredumpAssemblies(expired, 1000);
    const dump = Buffer.alloc(8192, 1);
    assemblies.begin('sock', 7, 3, { size: dump.length, crc32: crc32(dump) });
    jest.advanceTimersByTime(900);
    expect(assemblies.append(7, 3, 0, dump.subarray(0, 4096).toString('base64'))).toEqual({ nextOffset: 4096 });
    jest.advanceTimersByTime(900); // progress restarts the idle timer
    expect(assemblies.size).toBe(1);
    jest.advanceTimersByTime(200);
    expect(assemblies.size).toBe(0);
    expect(expired).toHaveBeenCalledWith(7, 3, 4096);
    expect(assemblies.append(7, 3, 4096, dump.subarray(4096).toString('base64'))).toEqual({
      error: 'COREDUMP_NO_UPLOAD',
    });
  });

  it('never allocates more than the partition', () => {
    const assemblies = new CoredumpAssemblies();
    expect(() => assemblies.begin('sock', 1, 1, { size: COREDUMP_MAX_BYTES + 1, crc32: 0 })).toThrow(RangeError);
    expect(assemblies.size).toBe(0);
  });

  it('reports the progress of an upload in progress', () => {
    const assemblies = new CoredumpAssemblies();
    expect(assemblies.received(1)).toBeNull();
    assemblies.begin('a', 1, 10, { size: 8, crc32: 0 });
    assemblies.append(1, 10, 0, Buffer.alloc(4).toString('base64'));
    expect(assemblies.received(1)).toBe(4);
  });

  it('only discards the upload of the closed socket', () => {
    const assemblies = new CoredumpAssemblies();
    assemblies.begin('a', 1, 10, { size: 10, crc32: 0 });
    assemblies.begin('b', 2, 20, { size: 10, crc32: 0 });
    expect(assemblies.discardSocket('a')).toEqual({ readerId: 1, reportId: 10, received: 0 });
    expect(assemblies.discardSocket('a')).toBeNull();
    expect(assemblies.size).toBe(1);
  });

  it.each([
    [undefined, 1, null],
    [0, 1, null],
    [10, -1, null],
    [10.5, 1, null],
    [2 ** 32, 1, null],
    [10, 0xffffffff, { size: 10, crc32: 0xffffffff }],
  ])('reads a declared dump of size %p and checksum %p', (size, checksum, expected) => {
    expect(declaredCoredump(size, checksum)).toEqual(expected);
  });
});
