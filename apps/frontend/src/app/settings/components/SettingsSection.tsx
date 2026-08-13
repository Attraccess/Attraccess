import type { ReactNode } from 'react';

interface SettingsSectionProps {
  title: string;
  description?: string;
  /** Reference material — endpoints, snippets, links. Omitted entirely when not passed. */
  aside?: ReactNode;
  children: ReactNode;
}

/**
 * A settings page: a content column capped at a readable measure, plus optional reference aside.
 *
 * The cap is on the column, not the page, so the aside sits beside it on a wide screen instead of
 * the form stretching to whatever the window happens to be.
 */
export function SettingsSection({ title, description, aside, children }: SettingsSectionProps) {
  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <div className="flex w-full max-w-2xl min-w-0 flex-col gap-6" data-slot="settings-content">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {description ? <p className="text-sm text-muted">{description}</p> : null}
        </div>
        {children}
      </div>

      {aside ? (
        <aside
          data-slot="settings-aside"
          className="flex w-full min-w-0 flex-col gap-4 rounded-lg bg-surface-secondary p-4 lg:w-80 lg:shrink-0"
        >
          {aside}
        </aside>
      ) : null}
    </div>
  );
}
