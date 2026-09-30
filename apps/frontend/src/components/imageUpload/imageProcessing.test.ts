import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canvasToBlob, fitWithin, loadImageFromFile, processImageWithAutoScale } from './imageProcessing';

describe('image upload processing', () => {
  let transparent = false;
  let failLoad = false;
  const drawImage = vi.fn();
  beforeEach(() => {
    transparent = false;
    failLoad = false;
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 800;
        naturalHeight = 400;
        onload?: () => void;
        onerror?: (error: Error) => void;
        set src(_value: string) {
          queueMicrotask(() => (failLoad ? this.onerror?.(new Error('decode failed')) : this.onload?.()));
        }
      },
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-upload');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      drawImage,
      getImageData: (_x: number, _y: number, width: number, height: number) => {
        const data = new Uint8ClampedArray(width * height * 4).fill(255);
        if (transparent) data[3] = 0;
        return { data };
      },
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback, type, quality) {
      callback(new Blob([new Uint8Array(Math.ceil(this.width * this.height * Number(quality)))], { type }));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    [800, 400, 200, undefined, { width: 200, height: 100 }],
    [800, 400, undefined, 100, { width: 200, height: 100 }],
    [800, 400, 2000, 2000, { width: 800, height: 400 }],
    [800, 400, undefined, undefined, { width: 800, height: 400 }],
  ])('fits %sx%s into bounds %sx%s while preserving aspect', (w, h, maxW, maxH, result) => {
    expect(fitWithin(w, h, maxW, maxH)).toEqual(result);
  });
  it.each([
    [false, undefined, 'image/jpeg', 'sample.jpg'],
    [true, undefined, 'image/webp', 'sample.webp'],
    [true, 'jpeg', 'image/jpeg', 'sample.jpg'],
    [false, 'webp', 'image/webp', 'sample.webp'],
  ] as const)('encodes alpha=%s with format=%s', async (alpha, output, type, name) => {
    transparent = alpha;
    const result = await processImageWithAutoScale(new File(['input'], 'sample.PNG'), {
      maxWidth: 400,
      output,
      maxBytes: 100_000,
    });
    expect(result.name).toBe(name);
    expect(result.type).toBe(type);
    expect(result.size).toBeLessThanOrEqual(100_000);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 400, 200);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-upload');
  });
  it('reduces dimensions when quality alone cannot meet the upload limit', async () => {
    const result = await processImageWithAutoScale(new File(['input'], 'large.jpg'), {
      maxWidth: 800,
      maxBytes: 40_000,
      minWidth: 100,
      minHeight: 50,
    });
    expect(result.size).toBeLessThanOrEqual(40_000);
    expect(drawImage.mock.calls.length).toBeGreaterThan(1);
  });
  it('releases the object URL when image decoding fails', async () => {
    failLoad = true;
    await expect(loadImageFromFile(new File([], 'broken.png'))).rejects.toThrow('decode failed');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-upload');
  });
  it('reports unavailable canvas and failed encoding', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    await expect(processImageWithAutoScale(new File([], 'sample.png'), {})).rejects.toThrow(
      'Canvas 2D context not available',
    );
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => callback(null));
    await expect(canvasToBlob(document.createElement('canvas'), 'image/jpeg')).rejects.toThrow('Failed to create blob');
  });
});
