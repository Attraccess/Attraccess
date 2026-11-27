import { strFromU8, unzipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import plugSource from './smart-plug-cover.scad?raw';
import { buildPlugFile, downloadPlug, plateOffsets, plugFileSlug, plugScadSource } from './plugDownload';
import { DEFAULT_PLUG_CONFIG, type PlugConfig } from './smartPlugConfig';
import type { PlugRender } from './usePlugRender';
import * as download from './download';

const angled: PlugConfig = {
  device: 'shelly_plus_gen3',
  cable: 'angled_euro',
  deviceExtraDiameter: 1.5,
  cordOpeningDiameter: 30.9,
  heightAbovePlug: 25,
  cableCutoutHeight: 30,
};

const triangle = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), triangleCount: 1 };
const render: PlugRender = {
  bodyStl: new Uint8Array([1, 2, 3]).buffer,
  coverStl: new Uint8Array([4, 5]).buffer,
  body: triangle,
  cover: triangle,
};

describe('plugScadSource', () => {
  it('writes every selected value into the shipped source', () => {
    const source = plugScadSource(plugSource, angled);
    expect(source).toContain('DEVICE = "shelly_plus_gen3";');
    expect(source).toContain('CABLE = "angled_euro";');
    expect(source).toContain('DEVICE_EXTRA_D = 1.5;');
    expect(source).toContain('CORD_OPEN_D = 30.9;');
    expect(source).toContain('HEIGHT_ABOVE_PLUG = 25;');
    expect(source).toContain('CABLE_CUT_H = 30;');
    // PART stays a free choice for whoever opens the file.
    expect(source).toContain('PART = "body";');
  });

  it('writes the fixed heights, not hidden angled values, for a straight cable', () => {
    const source = plugScadSource(plugSource, { ...DEFAULT_PLUG_CONFIG, heightAbovePlug: 30, cordOpeningDiameter: 10 });
    expect(source).toContain('HEIGHT_ABOVE_PLUG = 17.8;');
    expect(source).toContain('CORD_OPEN_D = 10;');
  });

  it('refuses a source without one of the assignments', () => {
    expect(() => plugScadSource('DEVICE = "x";', DEFAULT_PLUG_CONFIG)).toThrow(/CABLE assignment/);
  });
});

describe('plugFileSlug', () => {
  it('names the device, cable and every dimension', () => {
    expect(plugFileSlug(angled)).toBe(
      'attraccess-smart-plug-cover-shelly-plus-gen3-angled-euro-clearance-1.5mm-opening-30.9mm-height-25mm-cutout-30mm',
    );
    expect(plugFileSlug(DEFAULT_PLUG_CONFIG)).toBe(
      'attraccess-smart-plug-cover-nous-a1-straight-schuko-clearance-0mm-opening-12mm-height-17.8mm-cutout-24.2mm',
    );
  });
});

describe('buildPlugFile', () => {
  it('puts body and cover into one 3MF as two objects', () => {
    const xml = strFromU8(unzipSync(buildPlugFile(render, '3mf'))['3D/3dmodel.model']);
    expect(xml.match(/<object /g)).toHaveLength(2);
    expect(xml).toContain('<base name="Body"');
    expect(xml).toContain('<base name="Cover"');
  });

  it('stands body and cover side by side on the plate instead of nested', () => {
    // The cover comes out of OpenSCAD inside the body's bore, raised off the plate.
    const body = { positions: new Float32Array([-27, -27, -0.8, 27, 27, -0.8, 0, 0, 60.8]), triangleCount: 1 };
    const cover = { positions: new Float32Array([-23, -23, 43, 23, 23, 43, 0, 0, 60.8]), triangleCount: 1 };
    const [bodyOffset, coverOffset] = plateOffsets(body, cover);
    expect(bodyOffset[0]).toBe(0);
    expect(bodyOffset[2]).toBeCloseTo(0.8, 5);
    expect(coverOffset[0]).toBeCloseTo(27 + 10 + 23, 5);
    expect(coverOffset[2]).toBeCloseTo(-43, 5);

    const xml = strFromU8(unzipSync(buildPlugFile({ ...render, body, cover }, '3mf'))['3D/3dmodel.model']);
    expect(xml).toContain('<item objectid="2" transform="1 0 0 0 1 0 0 0 1 0.0000 0.0000 0.8000" />');
    expect(xml).toContain('<item objectid="3" transform="1 0 0 0 1 0 0 0 1 60.0000 0.0000 -43.0000" />');
  });

  it('puts the two STLs into a ZIP', () => {
    const zip = unzipSync(buildPlugFile(render, 'stl'));
    expect(Object.keys(zip).sort()).toEqual(['body.stl', 'cover.stl']);
    expect([...zip['cover.stl']]).toEqual([4, 5]);
  });
});

describe('downloadPlug', () => {
  afterEach(() => vi.restoreAllMocks());

  it('names the file after the configuration and format', () => {
    const trigger = vi.spyOn(download, 'triggerDownload').mockImplementation(() => undefined);
    downloadPlug(render, angled, 'stl');
    expect(trigger).toHaveBeenCalledWith(expect.any(Uint8Array), `${plugFileSlug(angled)}.zip`);
  });
});
