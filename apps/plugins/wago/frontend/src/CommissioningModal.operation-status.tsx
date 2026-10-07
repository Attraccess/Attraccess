import { ProgressBar, Spinner } from '@heroui/react';

export function OperationStatus({ title, description }: { title: string; description: string }) {
  return (
    <div aria-live="polite" className="wg:rounded-large wg:border wg:border-primary/30 wg:bg-primary/5 wg:p-3">
      <div className="wg:flex wg:items-center wg:gap-2">
        <Spinner color="accent" size="sm" />
        <p className="wg:text-sm wg:font-medium">{title}</p>
      </div>
      <p className="wg:mt-1 wg:text-xs wg:text-muted">{description}</p>
      <ProgressBar className="wg:mt-3" aria-label={title} isIndeterminate size="sm">
        <ProgressBar.Track>
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>
    </div>
  );
}
