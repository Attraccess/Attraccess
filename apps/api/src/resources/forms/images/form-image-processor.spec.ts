import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { limitConcurrency, processFormImage } from './form-image-processor';

const photo = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } } });

describe('processFormImage', () => {
  it('stores a JPEG without any metadata, GPS included', async () => {
    const source = await photo(400, 300)
      .withExif({ IFD0: { Copyright: 'someone' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '52/1 30/1 0/1' } })
      .withIccProfile('srgb')
      .jpeg()
      .toBuffer();
    expect((await sharp(source).metadata()).exif).toBeDefined();

    const processed = await processFormImage(source);

    const metadata = await sharp(processed.buffer).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(processed.mimeType).toBe('image/jpeg');
    expect(processed.buffer.includes(Buffer.from('someone'))).toBe(false);
  });

  it('turns the picture upright by its EXIF orientation', async () => {
    // Orientation 6: the sensor image is 400x300 and has to be turned 90 degrees to show 300x400.
    const source = await photo(400, 300).jpeg().withMetadata({ orientation: 6 }).toBuffer();

    const processed = await processFormImage(source);

    expect({ width: processed.width, height: processed.height }).toEqual({ width: 300, height: 400 });
    expect((await sharp(processed.buffer).metadata()).orientation).toBeUndefined();
  });

  it('scales down to at most 2560 px on the long edge and never scales up', async () => {
    const big = await processFormImage(await photo(5120, 2560).jpeg().toBuffer());
    expect({ width: big.width, height: big.height }).toEqual({ width: 2560, height: 1280 });

    const small = await processFormImage(await photo(640, 480).png().toBuffer());
    expect({ width: small.width, height: small.height }).toEqual({ width: 640, height: 480 });
  });

  it.each([
    ['png', () => photo(64, 64).png().toBuffer()],
    ['webp', () => photo(64, 64).webp().toBuffer()],
  ])('accepts %s and re-encodes it as JPEG', async (_name, make) => {
    const processed = await processFormImage(await make());
    expect((await sharp(processed.buffer).metadata()).format).toBe('jpeg');
  });

  it('puts a transparent PNG on white instead of black', async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const { data } = await sharp((await processFormImage(png)).buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(240);
  });

  it.each([
    ['text', Buffer.from('not an image')],
    ['an empty file', Buffer.alloc(0)],
    ['a truncated image', Buffer.from('\xff\xd8\xff\xe0garbage', 'latin1')],
  ])('rejects %s', async (_name, input) => {
    await expect(processFormImage(input)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an image format that is not JPEG, PNG or WebP', async () => {
    const gif = await photo(16, 16).gif().toBuffer();
    await expect(processFormImage(gif)).rejects.toThrow('not a JPEG, PNG or WebP');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>');
    await expect(processFormImage(svg)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('limitConcurrency', () => {
  it('runs at most the given number of tasks at once and every task in the end', async () => {
    const run = limitConcurrency(2);
    let active = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    const task = (value: number) =>
      run(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
        return value;
      });

    const results = Promise.all([1, 2, 3, 4, 5].map(task));
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setImmediate(resolve));
      releases.shift()?.();
    }

    expect(await results).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
  });

  it('frees the slot of a task that fails', async () => {
    const run = limitConcurrency(1);
    await expect(run(async () => Promise.reject(new Error('broken')))).rejects.toThrow('broken');
    await expect(run(async () => 'next')).resolves.toBe('next');
  });
});
