export function tarMember(name: string, data: string | Buffer, type = '0') {
  const bytes = Buffer.from(data);
  const header = Buffer.alloc(512);
  header.write(name);
  for (const [offset, width, value] of [
    [100, 8, 420],
    [108, 8, 0],
    [116, 8, 0],
    [124, 12, bytes.length],
    [136, 12, 0],
  ])
    header.write(value.toString(8).padStart(width - 1, '0') + '\0', offset);
  header.fill(32, 148, 156);
  header.write(type, 156);
  header.write('ustar\0', 257);
  header.write('00', 263);
  header.write(
    header
      .reduce((sum, byte) => sum + byte, 0)
      .toString(8)
      .padStart(6, '0') + '\0 ',
    148,
  );
  return Buffer.concat([header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512)]);
}
