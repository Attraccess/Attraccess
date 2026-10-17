export function header(name, bytes) {
  const result = Buffer.alloc(512);
  result.write(name, 0);
  for (const [offset, width, value] of [
    [100, 8, 0o644],
    [108, 8, 0],
    [116, 8, 0],
    [124, 12, bytes],
    [136, 12, 0],
  ]) {
    const field = value.toString(8).padStart(width - 1, '0') + '\0';
    if (field.length !== width) throw new Error('Runtime image is too large');
    result.write(field, offset);
  }
  result.fill(32, 148, 156);
  result[156] = 48;
  result.write('ustar\0', 257);
  result.write('00', 263);
  const sum = result.reduce((total, byte) => total + byte, 0);
  result.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return result;
}
