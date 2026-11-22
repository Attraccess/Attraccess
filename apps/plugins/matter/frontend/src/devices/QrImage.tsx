import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

const QUIET = 4;

/**
 * Draws a QR code locally as SVG (no request, nothing leaves the browser). The text is a secret sharing code: it is
 * only ever passed in as a prop and never stored.
 */
export function QrImage({ text, label }: Readonly<{ text: string; label: string }>) {
  const cells = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const size = qr.getModuleCount();
    const dark: [number, number][] = [];
    for (let row = 0; row < size; row += 1)
      for (let col = 0; col < size; col += 1) if (qr.isDark(row, col)) dark.push([row, col]);
    return { size, dark };
  }, [text]);
  const side = cells.size + QUIET * 2;
  return (
    <svg
      viewBox={`0 0 ${side} ${side}`}
      role="img"
      aria-label={label}
      className="mt:h-48 mt:w-48 mt:rounded-lg"
      shapeRendering="crispEdges"
      data-cy="matter-share-qr"
    >
      <rect width={side} height={side} fill="#fff" />
      {cells.dark.map(([row, col]) => (
        <rect key={`${row}-${col}`} x={col + QUIET} y={row + QUIET} width="1" height="1" fill="#000" />
      ))}
    </svg>
  );
}
