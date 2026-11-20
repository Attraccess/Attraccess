import { useState, type ReactNode } from 'react';

/** A signal starts collapsed and mounts its fields only once opened. */
export function SignalDisclosure({ label, children }: { label: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className="wg:rounded-lg wg:border wg:border-border wg:p-3"
    >
      <summary className="wg:cursor-pointer wg:font-medium">{label}</summary>
      {expanded && children}
    </details>
  );
}
