import { afterEach, describe, expect, it, vi } from 'vitest';
import { plugScadSource, scadWithLabel, triggerDownload } from './download';
import scadSource from './nfc-keychain-card.scad?raw';
import plugSource from './smart-plug-cover.scad?raw';

describe('scadWithLabel', () => {
  it('rewrites the LABEL default so the downloaded source matches what the preview showed', () => {
    expect(scadWithLabel('PART = "body";\nLABEL = "Makerspace";\nW = 60;', 'Robot Lab')).toBe(
      'PART = "body";\nLABEL = "Robot Lab";\nW = 60;',
    );
  });

  it('escapes quotes and backslashes so the result stays a valid OpenSCAD string', () => {
    expect(scadWithLabel('LABEL = "Makerspace";', 'He said "hi" \\ bye')).toBe('LABEL = "He said \\"hi\\" \\\\ bye";');
  });

  it('leaves other assignments alone', () => {
    const out = scadWithLabel('LABEL = "a";\nBRAND = "Attraccess";\nLABEL_CAP_MAX = 10;', 'b');
    expect(out).toContain('BRAND = "Attraccess";');
    expect(out).toContain('LABEL_CAP_MAX = 10;');
  });

  it('throws rather than silently returning the wrong label', () => {
    expect(() => scadWithLabel('W = 60;', 'x')).toThrow(/LABEL assignment/);
  });

  it('matches the .scad actually shipped, so the pattern cannot drift unnoticed', () => {
    // Without this, renaming or reformatting the LABEL line in nfc-keychain-card.scad would make
    // every .scad download throw, and only in the browser.
    expect(scadWithLabel(scadSource, 'Robot Lab')).toContain('LABEL = "Robot Lab";');
  });
});

describe('plugScadSource', () => {
  it('makes the downloaded source reproduce the selected profile and clearances', () => {
    const source = plugScadSource(plugSource, 'shelly_plus_gen3', 'angled_euro', 1.5, 30.9, 25, 30);
    expect(source).toContain('DEVICE = "shelly_plus_gen3";');
    expect(source).toContain('CABLE = "angled_euro";');
    expect(source).toContain('DEVICE_EXTRA_D = 1.5;');
    expect(source).toContain('CORD_OPEN_D = 30.9;');
    expect(source).toContain('HEIGHT_ABOVE_PLUG = 25;');
    expect(source).toContain('CABLE_CUT_H = 30;');
  });
});

describe('triggerDownload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does not revoke the object URL before the anchor click has been dispatched', () => {
    // Firefox and older Safari can silently abort a download if the object URL is revoked
    // synchronously after `click()`, before the click has actually been handled. Asserting the
    // ordering (click before revoke, and revoke deferred past the current task) is a regression
    // test for that.
    const events: string[] = [];
    vi.useFakeTimers();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => events.push('revoke'));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => events.push('click'));

    triggerDownload(new Uint8Array([1, 2, 3]), 'card.3mf');

    // Synchronously after triggerDownload returns, the click has happened but the revoke has not.
    expect(events).toEqual(['click']);

    vi.runAllTimers();

    expect(events).toEqual(['click', 'revoke']);
  });

  it('sets the anchor href and download attributes before clicking', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.href).toBe('blob:fake-url');
      expect(this.download).toBe('card.3mf');
    });

    triggerDownload(new Uint8Array([1, 2, 3]), 'card.3mf');

    expect(clickSpy).toHaveBeenCalledOnce();
  });
});
