/** Actual FW31 option subset and octal-offset framing; GNU flags must fail. */
export const fw31MinimalOd = `#!${process.execPath}
const fs = require('node:fs');
if (process.argv.slice(2).join(' ') !== '-b -v') process.exit(99);
const bytes = fs.readFileSync(0);
if (bytes.length > 8193) process.exit(98);
const lines = [];
for (let offset = 0; offset < bytes.length; offset += 16) {
  lines.push(offset.toString(8).padStart(7, '0') + ' ' + Array.from(bytes.subarray(offset, offset + 16), byte => byte.toString(8).padStart(3, '0')).join(' '));
}
lines.push(bytes.length.toString(8).padStart(7, '0'));
switch (process.env.OD_FAULT) {
  case 'truncated': lines.pop(); break;
  case 'bad-offset': lines[0] = lines[0].replace('0000000', '0000001'); break;
  case 'bad-byte': lines[0] = lines[0].replace(/ [0-7]{3}/, ' 400'); break;
  case 'bad-octal': lines[0] = lines[0].replace(/ [0-7]{3}/, ' 008'); break;
  case 'short-row': lines[0] = lines[0].slice(0, -4); break;
  case 'extra-terminal': lines.push(lines.at(-1)); break;
  case 'wrong-terminal': lines[lines.length - 1] = '0000000'; break;
  case 'repeat-marker': lines.splice(1, 0, '*'); break;
}
process.stdout.write(lines.join('\\n') + '\\n', () => process.exit(process.env.OD_FAULT === 'failed' ? 1 : 0));
`;
