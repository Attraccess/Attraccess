import { cn } from '@heroui/react';
import type { ReactNode } from 'react';

interface SettingsRowProps {
  label: ReactNode;
  hint?: ReactNode;
  /** Put the control under the label instead of beside it — for long values and wide inputs. */
  stacked?: boolean;
  children: ReactNode;
  'data-testid'?: string;
}

/**
 * One setting: label and hint on the left, control on the right, separated from the next by a
 * hairline.
 *
 * Each row is its own flex context. The previous layout put every control in one shared flow, so a
 * label wrapping to two lines dragged its neighbours' controls off the baseline — hence
 * `items-start` here and one container per row rather than one for the group.
 */
export function SettingsRow({ label, hint, stacked, children, 'data-testid': testId }: SettingsRowProps) {
  return (
    <div
      data-slot="settings-row"
      data-testid={testId}
      className={cn(
        'flex gap-4 border-b border-separator py-4 first:pt-0 last:border-b-0 last:pb-0',
        stacked ? 'flex-col items-stretch' : 'flex-row items-start justify-between',
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {hint ? <div className="text-xs text-muted">{hint}</div> : null}
      </div>

      <div className={cn('flex items-start gap-2', stacked ? 'w-full' : 'shrink-0')}>{children}</div>
    </div>
  );
}
