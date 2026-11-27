import type { ReactNode } from 'react';

interface Props {
  title: ReactNode;
  children: ReactNode;
}

/** A headed section of the version dialog. */
export function VersionSection({ title, children }: Props) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}
