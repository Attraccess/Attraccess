// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageTooLargeError, MAX_IMAGE_BYTES } from './imageLimits';
import { loadImagePixels } from './loadImagePixels';

/** An `<img>` that "loads" a picture of the given size as soon as it gets a source; jsdom decodes nothing. */
function stubImage(width: number, height: number) {
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = width;
      naturalHeight = height;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_url: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
}

describe('loadImagePixels', () => {
  const createObjectURL = vi.fn(() => 'blob:picture');
  const revokeObjectURL = vi.fn();
  const close = vi.fn();
  const createImageBitmap = vi.fn(async () => ({ close }));
  const drawImage = vi.fn();

  beforeEach(() => {
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
      getImageData: (_x: number, _y: number, width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      }),
    } as never);
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('refuses a file above 20 MB without reading it', async () => {
    const file = { size: MAX_IMAGE_BYTES + 1 } as Blob;
    await expect(loadImagePixels(file)).rejects.toBeInstanceOf(ImageTooLargeError);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('refuses a picture above 40 megapixels from its size alone, before decoding it', async () => {
    stubImage(9000, 9000);
    await expect(loadImagePixels(new Blob(['x']))).rejects.toBeInstanceOf(ImageTooLargeError);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:picture');
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('decodes a large photo straight to at most 1600 pixels on its long edge', async () => {
    stubImage(4000, 3000);
    const pixels = await loadImagePixels(new Blob(['x']));
    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), {
      resizeWidth: 1600,
      resizeHeight: 1200,
      resizeQuality: 'medium',
    });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
    expect(pixels).toMatchObject({ width: 1600, height: 1200 });
    expect(close).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:picture');
  });

  it('keeps a small picture at its size and reports a picture it cannot read', async () => {
    stubImage(300, 200);
    await expect(loadImagePixels(new Blob(['x']))).resolves.toMatchObject({ width: 300, height: 200 });
    vi.stubGlobal(
      'Image',
      class {
        onerror: (() => void) | null = null;
        set src(_url: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );
    await expect(loadImagePixels(new Blob(['x']))).rejects.toThrow('could not be read');
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});
