import type { ReactNode } from 'react';

/** One label/value pair of a `<dl>`: device facts, connection details. Long values wrap at word boundaries. */
export function Fact({ label, children, dataCy }: Readonly<{ label: string; children: ReactNode; dataCy?: string }>) {
  return (
    <div className="mt:flex mt:min-w-0 mt:flex-col" data-cy={dataCy}>
      <dt className="mt:text-xs mt:text-muted">{label}</dt>
      <dd className="mt:break-words">{children}</dd>
    </div>
  );
}
