import assert from 'node:assert/strict';
import sharp from 'sharp';

export async function imageMatches(actual, expected) {
  const [actualImage, expectedImage] = await Promise.all(
    [actual, expected].map(async (image) => {
      const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return { data, info };
    }),
  );
  return (
    actualImage.info.width === expectedImage.info.width &&
    actualImage.info.height === expectedImage.info.height &&
    actualImage.data.equals(expectedImage.data)
  );
}

export function icoFrames(file) {
  assert.equal(file.readUInt16LE(0), 0, 'ICO must start with a reserved value of zero');
  assert.equal(file.readUInt16LE(2), 1, 'Expected an ICO file');
  const count = file.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const entry = 6 + index * 16;
    const size = file.readUInt32LE(entry + 8);
    const offset = file.readUInt32LE(entry + 12);
    return {
      header: file.subarray(entry, entry + 8),
      image: file.subarray(offset, offset + size),
    };
  });
}

export async function assetMatches(path, actual, expected) {
  if (path.endsWith('.png')) return imageMatches(actual, expected);
  if (!path.endsWith('.ico')) return actual.equals(expected);

  const actualFrames = icoFrames(actual);
  const expectedFrames = icoFrames(expected);
  if (actualFrames.length !== expectedFrames.length) return false;
  if (!actualFrames.every((frame, index) => frame.header.equals(expectedFrames[index].header))) return false;
  return (
    await Promise.all(actualFrames.map((frame, index) => imageMatches(frame.image, expectedFrames[index].image)))
  ).every(Boolean);
}
