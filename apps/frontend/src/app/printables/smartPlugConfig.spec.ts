import { describe, expect, it } from 'vitest';
import {
  ANGLED_COVER_SLOT,
  cordOpeningLimits,
  DEFAULT_PLUG_CONFIG,
  effectivePlugConfig,
  HEIGHT_ABOVE_PLUG_LIMITS,
  heightAbovePlugLimits,
  MIN_HEIGHT_ABOVE_PLUG,
  toScadDefines,
  withCable,
  type PlugConfig,
} from './smartPlugConfig';

const angled: PlugConfig = {
  ...DEFAULT_PLUG_CONFIG,
  cable: 'angled_euro',
  cordOpeningDiameter: ANGLED_COVER_SLOT,
  heightAbovePlug: 25,
  cableCutoutHeight: 30,
};

describe('cordOpeningLimits', () => {
  it('caps straight Schuko at 16 mm and straight Euro at 12 mm', () => {
    expect(cordOpeningLimits('straight_schuko')).toMatchObject({ min: 5, max: 16, default: 12 });
    expect(cordOpeningLimits('straight_euro')).toMatchObject({ min: 5, max: 12, default: 9 });
  });
});

describe('withCable', () => {
  it('resets both heights to the straight defaults when switching from an angled cable', () => {
    expect(withCable(angled, 'straight_schuko')).toMatchObject({
      cable: 'straight_schuko',
      cordOpeningDiameter: 12,
      heightAbovePlug: 50,
      cableCutoutHeight: 24.2,
    });
    expect(withCable(angled, 'straight_euro')).toMatchObject({ cordOpeningDiameter: 9, heightAbovePlug: 50 });
  });

  it('resets the height to the angled default when switching from a straight cable', () => {
    expect(withCable({ ...DEFAULT_PLUG_CONFIG, heightAbovePlug: 60 }, 'angled_schuko')).toMatchObject({
      heightAbovePlug: 17.8,
      cableCutoutHeight: 24.2,
    });
  });

  it('keeps the height between straight cables', () => {
    expect(withCable({ ...DEFAULT_PLUG_CONFIG, heightAbovePlug: 42 }, 'straight_euro').heightAbovePlug).toBe(42);
  });

  it('keeps the heights between angled cables and fixes the opening to the 30.9 mm slot', () => {
    expect(withCable(angled, 'angled_schuko')).toMatchObject({
      heightAbovePlug: 25,
      cableCutoutHeight: 30,
      cordOpeningDiameter: 30.9,
    });
    expect(withCable({ ...DEFAULT_PLUG_CONFIG, cordOpeningDiameter: 16 }, 'angled_schuko').cordOpeningDiameter).toBe(
      30.9,
    );
  });

  it('does not carry a Schuko opening above the Euro cap over to a Euro cable', () => {
    expect(withCable({ ...DEFAULT_PLUG_CONFIG, cordOpeningDiameter: 16 }, 'straight_euro').cordOpeningDiameter).toBe(9);
  });
});

describe('effectivePlugConfig', () => {
  it('ignores a hidden cutout height for a straight cable but keeps its height', () => {
    const leaked = { ...DEFAULT_PLUG_CONFIG, heightAbovePlug: 30, cableCutoutHeight: 35 };
    expect(effectivePlugConfig(leaked)).toEqual({ ...DEFAULT_PLUG_CONFIG, heightAbovePlug: 30 });
  });

  it('pins the opening of an angled cable to the 30.9 mm slot', () => {
    expect(effectivePlugConfig({ ...angled, cordOpeningDiameter: 12 }).cordOpeningDiameter).toBe(30.9);
  });

  it('rounds away float noise from 0.1 mm steps', () => {
    expect(effectivePlugConfig({ ...angled, heightAbovePlug: 17.900000000000002 }).heightAbovePlug).toBe(17.9);
  });
});

describe('toScadDefines', () => {
  it('passes every configurable parameter as an OpenSCAD literal', () => {
    expect(toScadDefines(angled)).toEqual({
      DEVICE: '"nous_a1"',
      CABLE: '"angled_euro"',
      DEVICE_EXTRA_D: 0,
      CORD_OPEN_D: 30.9,
      HEIGHT_ABOVE_PLUG: 25,
      CABLE_CUT_H: 30,
    });
  });
});

it('limits the height per cable kind, with the plug-sized default for straight cables', () => {
  expect(heightAbovePlugLimits('angled_euro')).toMatchObject({ min: 14, max: 40, default: 17.8 });
  expect(heightAbovePlugLimits('straight_schuko')).toMatchObject({ min: 17.8, max: 80, default: 50 });
  expect(DEFAULT_PLUG_CONFIG.heightAbovePlug).toBe(50);
});

it('never allows an angled height that would cut away the cover retaining ring', () => {
  // The .scad's cover skirt is 12 mm tall; the ring above it must keep material.
  expect(HEIGHT_ABOVE_PLUG_LIMITS.min).toBe(MIN_HEIGHT_ABOVE_PLUG);
  expect(MIN_HEIGHT_ABOVE_PLUG).toBeGreaterThan(12);
});
