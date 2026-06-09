// Shared accent-bordered HeroUI Card wrapper for "current usage session" states
// Keeps the active / other-user session cards visually consistent (ATT-538)
import { HTMLAttributes, ReactNode } from 'react';
import { Card, CardContent, Chip, cn } from '@heroui/react';

type SessionAccent = 'success' | 'warning';

const accentClasses: Record<SessionAccent, string> = {
  success: 'border-l-success bg-success/5',
  warning: 'border-l-warning bg-warning/5',
};

interface SessionStatusCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> {
  accent: SessionAccent;
  statusLabel: ReactNode;
  /** Render a pulsing decorative dot before the status label (e.g. a live indicator). */
  pulse?: boolean;
  /** Center the status chip instead of left-aligning it. */
  centerStatus?: boolean;
  /** Extra classes for the card body (e.g. text alignment). */
  bodyClassName?: string;
  chipDataCy?: string;
  children: ReactNode;
}

export function SessionStatusCard({
  accent,
  statusLabel,
  pulse,
  centerStatus,
  bodyClassName,
  chipDataCy,
  children,
  ...rest
}: SessionStatusCardProps) {
  return (
    <Card className={cn('border-l-4', accentClasses[accent])} {...rest}>
      <CardContent className={cn('p-4 space-y-4', bodyClassName)}>
        <div className={cn('flex items-center gap-2', centerStatus ? 'justify-center' : 'justify-between')}>
          <Chip color={accent} data-cy={chipDataCy}>
            {pulse ? (
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                {statusLabel}
              </span>
            ) : (
              statusLabel
            )}
          </Chip>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
