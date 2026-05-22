import { describe, expect, it } from 'vitest';
import { ALL_CONNECTORS, assertWiresAllSignals, countPinsByDirection } from './index';
import { J_POE } from './j-poe';
import { J_NFC } from './j-nfc';

describe.each(ALL_CONNECTORS.map((c) => [c.name, c] as const))(
  'Connector %s',
  (_name, connector) => {
    it('has no duplicate pin numbers', () => {
      const pins = Object.keys(connector.pins).map((p) => Number.parseInt(p, 10));
      const unique = new Set(pins);
      expect(unique.size).toBe(pins.length);
    });

    it('declares pinCount matching pin entries', () => {
      expect(Object.keys(connector.pins)).toHaveLength(connector.pinCount);
    });

    it('uses sequential pin numbers starting at 1', () => {
      const pins = Object.keys(connector.pins)
        .map((p) => Number.parseInt(p, 10))
        .sort((a, b) => a - b);
      const expected = Array.from({ length: connector.pinCount }, (_, i) => i + 1);
      expect(pins).toEqual(expected);
    });

    it('every pin has a direction from the allowed set', () => {
      const allowed = new Set(['in', 'out', 'bidir', 'power', 'gnd']);
      for (const def of Object.values(connector.pins)) {
        expect(allowed.has(def.direction)).toBe(true);
      }
    });

    it('power pin count matches the design doc table', () => {
      expect(countPinsByDirection(connector, 'power')).toBe(connector.expectedPowerPins);
    });

    it('ground pin count matches the design doc table', () => {
      expect(countPinsByDirection(connector, 'gnd')).toBe(connector.expectedGndPins);
    });

    it('every required signal appears on at least one pin', () => {
      const present = new Set(Object.values(connector.pins).map((p) => p.signal));
      for (const sig of connector.requiredSignals) {
        expect(present.has(sig)).toBe(true);
      }
    });

    it('power pins carry a voltage tag', () => {
      for (const def of Object.values(connector.pins)) {
        if (def.direction === 'power') {
          expect(def.voltage, `${connector.name} pin signal ${def.signal} missing voltage`).toBeTruthy();
        }
      }
    });
  },
);

describe('assertWiresAllSignals', () => {
  it('accepts a complete mapping', () => {
    const wires = {
      '+5V': 'net.vcc',
      'GND': 'net.gnd',
      'PWM': 'net.beep_pwm',
    } as const;
    expect(() => assertWiresAllSignals(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { name: 'X', footprint: 'f', pitch: '1.25mm', pinCount: 3, pins: {}, requiredSignals: ['+5V', 'GND', 'PWM'], expectedPowerPins: 1, expectedGndPins: 1 } as any,
      wires,
    )).not.toThrow();
  });

  it('throws when a required signal is missing at runtime', () => {
    expect(() => assertWiresAllSignals(
      J_POE,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { '+5V': null, GND: null } as any,
    )).toThrow(/missing required signals/);
  });

  it('binds a real connector wire mapping by signal', () => {
    const wires = assertWiresAllSignals(J_NFC, {
      '+3V3': 'net.v3v3',
      '+5V': 'net.v5v',
      'GND': 'net.gnd',
      'I2C_SDA': 'net.sda',
      'I2C_SCL': 'net.scl',
      'IRQ': 'net.nfc_irq',
      'RSTPDN': 'net.nfc_rstpdn',
      'LED_DATA': 'net.ring_din',
    });
    expect(wires['I2C_SDA']).toBe('net.sda');
  });
});
