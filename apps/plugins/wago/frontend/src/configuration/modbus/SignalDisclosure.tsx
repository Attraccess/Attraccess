import { useState, type ReactNode } from 'react';

export function SignalDisclosure({
  label,
  defaultExpanded,
  children,
}: {
  label: string;
  defaultExpanded: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
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
