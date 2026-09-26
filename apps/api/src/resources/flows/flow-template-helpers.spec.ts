import Handlebars from 'handlebars';
import { registerFlowTemplateHelpers } from './flow-template-helpers';

describe('flow arithmetic templates', () => {
  const handlebars = Handlebars.create();
  registerFlowTemplateHelpers(handlebars);
  const charge = handlebars.compile('{{roundRatio (subtract end start) rate 1000000}}');

  it.each([
    [0, 0],
    [16666, 0],
    [16667, 1],
    [1000000, 30],
    [1500000, 45],
    [123456, 4],
  ])('charges %i mWh at 30 cents/kWh as %i cents', (consumed, cents) => {
    expect(charge({ start: 123456789, end: 123456789 + consumed, rate: 30 })).toBe(String(cents));
  });

  it('uses exact intermediates even when multiplication exceeds the safe-number range', () => {
    expect(handlebars.compile('{{roundRatio value 30 1000000}}')({ value: Number.MAX_SAFE_INTEGER })).toBe(
      '270215977642',
    );
  });

  it.each([undefined, null, '', false, '1.2', 'NaN', Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid counter data %s rather than creating a default charge',
    (end) => {
      expect(() => charge({ start: 0, end, rate: 30 })).toThrow();
    },
  );

  it('rejects division by zero and overflowing results', () => {
    expect(() => handlebars.compile('{{divide 1 0}}')({})).toThrow();
    expect(() => handlebars.compile('{{roundRatio 1 30 0}}')({})).toThrow();
    expect(() => handlebars.compile('{{roundRatio value value 1}}')({ value: Number.MAX_SAFE_INTEGER })).toThrow();
  });

  it('formats the actual consumed kWh and keeps JSON snapshots intact', () => {
    expect(handlebars.compile('{{divide (subtract end start) 1000000}}')({ start: 1000000, end: 1250000 })).toBe(
      '0.25',
    );
    expect(handlebars.compile('{{json reading}}')({ reading: { value: 0, unit: 'milliwatt-hour' } })).toBe(
      '{"value":0,"unit":"milliwatt-hour"}',
    );
  });

  it('supports timestamps used to require a final reading after relay acknowledgement', () => {
    const date = new Date('2026-09-26T12:00:00.000Z');
    const timestamp = handlebars.compile('{{timestamp value}}');
    expect(timestamp({ value: date })).toBe(String(date.getTime()));
    expect(timestamp({ value: date.toISOString() })).toBe(String(date.getTime()));
    expect(() => timestamp({ value: '' })).toThrow();
    expect(() => timestamp({})).toThrow();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(date.getTime());
    try {
      expect(handlebars.compile('{{now}}')({})).toBe(String(date.getTime()));
    } finally {
      clock.mockRestore();
    }
  });
});
