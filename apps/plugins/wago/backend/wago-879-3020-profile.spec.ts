import { BUILTIN_MODBUS_PROFILES, duplicateProfile, validateModbus } from '../modbus/model';
import { encodeMeasurement, parseMeasurement } from '../measurement-contract';

describe('complete WAGO 879-3020 readable register map', () => {
  const profile = BUILTIN_MODBUS_PROFILES[0];
  it('covers every non-reserved FC03 entry in WAGO manual V1.6 appendix A3.2', () => {
    const information = [
      0x4000, 0x4002, 0x4003, 0x4004, 0x4005, 0x4007, 0x4009, 0x400b, 0x400c, 0x400d, 0x400f, 0x4010, 0x4011, 0x4012,
      0x4013, 0x4014, 0x4016, 0x4017, 0x4018, 0x4019, 0x401a, 0x401b, 0x401d, 0x401f, 0x4021, 0x4022, 0x4023, 0x4026,
      0x4032, 0x4033,
    ];
    const electrical = Array.from({ length: 28 }, (_, i) => 0x5000 + 2 * i);
    const energy = [
      ...Array.from({ length: 36 }, (_, i) => 0x6000 + 2 * i),
      0x6048,
      ...Array.from({ length: 36 }, (_, i) => 0x6049 + 2 * i),
    ];
    expect(profile.measurements.map((m) => m.address).sort((a, b) => a - b)).toEqual([
      ...information,
      ...electrical,
      ...energy,
    ]);
    expect(new Set(profile.measurements.map((m) => m.id)).size).toBe(131);
    expect(profile.actions).toEqual([]);
    expect(validateModbus({ connections: [], devices: [], profiles: [duplicateProfile(profile, 'copy')] })).toEqual([]);
  });
  it.each(['hertz', 'var', 'volt-ampere', 'var-hour', 'ratio', 'number', 'second', 'pulse-per-kilowatt-hour'])(
    'carries %s through the integer measurement contract',
    (unit) => {
      const encoded = encodeMeasurement('channel', 12.345, { unit, scale: 1, offset: 0 });
      expect(encoded.value).toBe(12345);
      expect(parseMeasurement(encoded)).toEqual(encoded);
    },
  );
  it('treats resettable day counters and net energy as live readings', () => {
    for (const address of [0x6000, 0x6002, 0x6004, 0x6049, 0x608b, 0x608d, 0x608f])
      expect(profile.measurements.find((m) => m.address === address)?.kind).toBe('live');
  });
});
