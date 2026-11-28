/**
 * The smart-plug cover's configuration and how it maps onto smart-plug-cover.scad's parameters.
 * Shared by the configurator UI, the render worker and the downloads, so all three agree on what
 * a configuration means. The limits mirror the asserts in the .scad.
 */

import type { ScadDefines } from './openscadRuntime';

export type PlugDevice = 'nous_a1' | 'shelly_plus_gen3' | 'shelly_legacy';
export type PlugCable = 'straight_schuko' | 'straight_euro' | 'angled_schuko' | 'angled_euro';

export interface PlugConfig {
  device: PlugDevice;
  cable: PlugCable;
  /** Extra diametral clearance on top of the 0.5 mm nominal fit. */
  deviceExtraDiameter: number;
  /** Straight cables only. */
  cordOpeningDiameter: number;
  /** How far the cover reaches above the plug face; its range and default depend on the cable. */
  heightAbovePlug: number;
  /** Angled cables only. */
  cableCutoutHeight: number;
}

export const PLUG_DEVICES: readonly PlugDevice[] = ['nous_a1', 'shelly_plus_gen3', 'shelly_legacy'];
export const PLUG_CABLES: readonly PlugCable[] = ['straight_schuko', 'straight_euro', 'angled_schuko', 'angled_euro'];

/** The STEP profile's heights: the angled default, and the cutout height straight cables use. */
export const DEFAULT_HEIGHT_ABOVE_PLUG = 17.8;
export const DEFAULT_CABLE_CUTOUT_HEIGHT = 24.2;
/**
 * A straight plug sticks out of the smart plug, so its cover is a hollow cap that holds the whole
 * plug under a ring the cable passes through. 50 mm fits a typical straight Schuko plug with its
 * strain relief (the 17.8 mm STEP height does not: a test print rode on the plug).
 */
export const DEFAULT_STRAIGHT_HEIGHT_ABOVE_PLUG = 50;
/** Fixed cover slot of the angled variants, from the STEP (the body's mouth is 34.17 mm). */
export const ANGLED_COVER_SLOT = 30.9;

export const DEVICE_EXTRA_DIAMETER_LIMITS = { min: 0, max: 4, step: 0.5 } as const;
/**
 * The cover's 12 mm locating skirt plus a 2 mm retaining ring. Any lower and the skirt's bore
 * would cut the ring that holds the cover over the plug away entirely.
 */
export const MIN_HEIGHT_ABOVE_PLUG = 14;
export const HEIGHT_ABOVE_PLUG_LIMITS = { min: MIN_HEIGHT_ABOVE_PLUG, max: 40, step: 0.1 } as const;
/** Straight cables: from the STEP height (the cap's 5.8 mm top ring over a 12 mm cavity) to a long plug. */
export const STRAIGHT_HEIGHT_ABOVE_PLUG_LIMITS = { min: DEFAULT_HEIGHT_ABOVE_PLUG, max: 80, step: 0.1 } as const;
export const CABLE_CUTOUT_HEIGHT_LIMITS = { min: 10, max: 40, step: 0.1 } as const;

export const DEFAULT_PLUG_CONFIG: PlugConfig = {
  device: 'nous_a1',
  cable: 'straight_schuko',
  deviceExtraDiameter: 0,
  cordOpeningDiameter: 12,
  heightAbovePlug: DEFAULT_STRAIGHT_HEIGHT_ABOVE_PLUG,
  cableCutoutHeight: DEFAULT_CABLE_CUTOUT_HEIGHT,
};

export function isAngled(cable: PlugCable): boolean {
  return cable === 'angled_schuko' || cable === 'angled_euro';
}

/** Allowed height above the plug face for `cable`, with its default. */
export function heightAbovePlugLimits(cable: PlugCable): { min: number; max: number; step: number; default: number } {
  return isAngled(cable)
    ? { ...HEIGHT_ABOVE_PLUG_LIMITS, default: DEFAULT_HEIGHT_ABOVE_PLUG }
    : { ...STRAIGHT_HEIGHT_ABOVE_PLUG_LIMITS, default: DEFAULT_STRAIGHT_HEIGHT_ABOVE_PLUG };
}

/** Allowed straight-cable opening; the default is the middle of a typical cord's range. */
export function cordOpeningLimits(cable: PlugCable): { min: number; max: number; step: number; default: number } {
  const euro = cable === 'straight_euro' || cable === 'angled_euro';
  return euro ? { min: 5, max: 12, step: 0.5, default: 9 } : { min: 5, max: 16, step: 0.5, default: 12 };
}

/**
 * Switches the cable type. The opening goes back to the new cable's default. Switching between
 * straight and angled also resets both heights to the new kind's defaults: the two kinds use
 * different height ranges, and the angled-only cutout height must never come back unseen in a
 * later straight render. Between two cables of the same kind the heights are kept.
 */
export function withCable(config: PlugConfig, cable: PlugCable): PlugConfig {
  const sameKind = isAngled(cable) === isAngled(config.cable);
  return {
    ...config,
    cable,
    cordOpeningDiameter: isAngled(cable) ? ANGLED_COVER_SLOT : cordOpeningLimits(cable).default,
    ...(sameKind
      ? {}
      : { heightAbovePlug: heightAbovePlugLimits(cable).default, cableCutoutHeight: DEFAULT_CABLE_CUTOUT_HEIGHT }),
  };
}

/**
 * The configuration that actually shapes the model: the fields the selected cable ignores are
 * pinned to their fixed values. Renders, file names and the .scad download all use this.
 */
export function effectivePlugConfig(config: PlugConfig): PlugConfig {
  const pinned = isAngled(config.cable)
    ? { ...config, cordOpeningDiameter: ANGLED_COVER_SLOT }
    : { ...config, cableCutoutHeight: DEFAULT_CABLE_CUTOUT_HEIGHT };
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
export function toScadDefines(config: PlugConfig): ScadDefines {
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
