/**
 * The smart-plug cover's configuration and how it maps onto smart-plug-cover.scad's parameters.
 * Shared by the configurator UI, the render worker and the downloads, so all three agree on what
 * a configuration means. The limits mirror the asserts in the .scad.
 */

export type PlugDevice = 'nous_a1' | 'shelly_plus_gen3' | 'shelly_legacy';
export type PlugCable = 'straight_schuko' | 'straight_euro' | 'angled_schuko' | 'angled_euro';

export interface PlugConfig {
  device: PlugDevice;
  cable: PlugCable;
  /** Extra diametral clearance on top of the 0.5 mm nominal fit. */
  deviceExtraDiameter: number;
  /** Straight cables only. */
  cordOpeningDiameter: number;
  /** Angled cables only. */
  heightAbovePlug: number;
  /** Angled cables only. */
  cableCutoutHeight: number;
}

export const PLUG_DEVICES: readonly PlugDevice[] = ['nous_a1', 'shelly_plus_gen3', 'shelly_legacy'];
export const PLUG_CABLES: readonly PlugCable[] = ['straight_schuko', 'straight_euro', 'angled_schuko', 'angled_euro'];

/** The STEP profile's heights; straight cables always use them. */
export const DEFAULT_HEIGHT_ABOVE_PLUG = 17.8;
export const DEFAULT_CABLE_CUTOUT_HEIGHT = 24.2;
/** Fixed openings of the angled variants, from the STEP. */
export const ANGLED_COVER_SLOT = 30.9;
export const ANGLED_BODY_MOUTH = 34.17;

export const DEVICE_EXTRA_DIAMETER_LIMITS = { min: 0, max: 4, step: 0.5 } as const;
/**
 * The cover's 12 mm locating skirt plus a 2 mm retaining ring. Any lower and the skirt's bore
 * would cut the ring that holds the cover over the plug away entirely.
 */
export const MIN_HEIGHT_ABOVE_PLUG = 14;
export const HEIGHT_ABOVE_PLUG_LIMITS = { min: MIN_HEIGHT_ABOVE_PLUG, max: 40, step: 0.1 } as const;
export const CABLE_CUTOUT_HEIGHT_LIMITS = { min: 10, max: 40, step: 0.1 } as const;

export const DEFAULT_PLUG_CONFIG: PlugConfig = {
  device: 'nous_a1',
  cable: 'straight_schuko',
  deviceExtraDiameter: 0,
  cordOpeningDiameter: 12,
  heightAbovePlug: DEFAULT_HEIGHT_ABOVE_PLUG,
  cableCutoutHeight: DEFAULT_CABLE_CUTOUT_HEIGHT,
};

export function isAngled(cable: PlugCable): boolean {
  return cable === 'angled_schuko' || cable === 'angled_euro';
}

/** Allowed straight-cable opening; the default is the middle of a typical cord's range. */
export function cordOpeningLimits(cable: PlugCable): { min: number; max: number; step: number; default: number } {
  const euro = cable === 'straight_euro' || cable === 'angled_euro';
  return euro ? { min: 5, max: 12, step: 0.5, default: 9 } : { min: 5, max: 16, step: 0.5, default: 12 };
}

/**
 * Switches the cable type. The opening goes back to the new cable's default, and a straight
 * cable resets the angled-only heights, so values typed for an angled cable never come back
 * unseen in a later straight render.
 */
export function withCable(config: PlugConfig, cable: PlugCable): PlugConfig {
  return {
    ...config,
    cable,
    cordOpeningDiameter: isAngled(cable) ? ANGLED_COVER_SLOT : cordOpeningLimits(cable).default,
    ...(isAngled(cable)
      ? {}
      : { heightAbovePlug: DEFAULT_HEIGHT_ABOVE_PLUG, cableCutoutHeight: DEFAULT_CABLE_CUTOUT_HEIGHT }),
  };
}

/**
 * The configuration that actually shapes the model: the fields the selected cable ignores are
 * pinned to their fixed values. Renders, file names and the .scad download all use this.
 */
export function effectivePlugConfig(config: PlugConfig): PlugConfig {
  const pinned = isAngled(config.cable)
    ? { ...config, cordOpeningDiameter: ANGLED_COVER_SLOT }
    : { ...config, heightAbovePlug: DEFAULT_HEIGHT_ABOVE_PLUG, cableCutoutHeight: DEFAULT_CABLE_CUTOUT_HEIGHT };
  // Stepping by 0.1 can leave float noise (17.900000000000002) that would end up in file names.
  return {
    ...pinned,
    deviceExtraDiameter: round(pinned.deviceExtraDiameter),
    cordOpeningDiameter: round(pinned.cordOpeningDiameter),
    heightAbovePlug: round(pinned.heightAbovePlug),
    cableCutoutHeight: round(pinned.cableCutoutHeight),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** OpenSCAD `-D` values (already OpenSCAD literals) for every configurable .scad parameter. */
export function toScadDefines(config: PlugConfig): Record<string, string | number> {
  const effective = effectivePlugConfig(config);
  return {
    DEVICE: JSON.stringify(effective.device),
    CABLE: JSON.stringify(effective.cable),
    DEVICE_EXTRA_D: effective.deviceExtraDiameter,
    CORD_OPEN_D: effective.cordOpeningDiameter,
    HEIGHT_ABOVE_PLUG: effective.heightAbovePlug,
    CABLE_CUT_H: effective.cableCutoutHeight,
  };
}
