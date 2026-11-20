import type { ReactNode } from 'react';
import { cn } from '@heroui/react';
import { TriangleAlertIcon } from 'lucide-react';

export interface NodeNoticeProps {
  className: string;
  children: ReactNode;
}

/** A warning line under a flow node card, kept to the card's width; long text wraps, even without spaces. */
export function NodeNotice({ className, children }: Readonly<NodeNoticeProps>) {
  return (
    <div className={cn('text-xs mt-1 px-1 w-64 flex flex-row items-start gap-1', className)}>
      <TriangleAlertIcon size={12} className="shrink-0 mt-0.5" />
      <span className="min-w-0 wrap-anywhere">{children}</span>
    </div>
  );
}
