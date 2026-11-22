import type { ReactNode } from 'react';

/** The heading of a flow step or outcome. Focusable by script only: useFocusOnChange moves the focus to it. */
export function StepHeading({ children, 'data-cy': dataCy }: Readonly<{ children: ReactNode; 'data-cy'?: string }>) {
  return (
    <h3 tabIndex={-1} className="mt:text-lg mt:font-semibold mt:outline-none" data-cy={dataCy}>
      {children}
    </h3>
  );
}
