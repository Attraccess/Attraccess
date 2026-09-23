import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Label, SearchField, cn } from '@heroui/react';
import { ChevronRight } from 'lucide-react';

interface SettingsDirectoryItemBase {
  key: string;
  title: string;
  description: string;
  icon?: ReactNode;
  searchTerms?: string[];
}

/** Each row is either a routed destination or an inline editor. */
export type SettingsDirectoryItem = SettingsDirectoryItemBase &
  ({ to: string; content?: never } | { to?: never; content: ReactNode });

export interface SettingsDirectoryGroup {
  key: string;
  label: string;
  items: SettingsDirectoryItem[];
}

interface SettingsDirectoryProps {
  groups: SettingsDirectoryGroup[];
  searchLabel: string;
  emptyMessage: string;
  className?: string;
}

/** Grouped, searchable settings navigation. Inline editors open one at a time; routed items stay links. */
export function SettingsDirectory({ groups, searchLabel, emptyMessage, className }: SettingsDirectoryProps) {
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [visitedKeys, setVisitedKeys] = useState<Set<string>>(() => new Set());
  const id = useId();
  const normalizedQuery = normalize(query.trim());
  const matches = (group: SettingsDirectoryGroup, item: SettingsDirectoryItem) =>
    normalize([group.label, item.title, item.description, ...(item.searchTerms ?? [])].join(' ')).includes(normalizedQuery);
  const populatedGroups = groups.filter((group) => group.items.length > 0);
  const hasMatches = populatedGroups.some((group) => group.items.some((item) => matches(group, item)));

  return (
    <div className={cn('mx-auto w-full max-w-3xl', className)}>
      <SearchField fullWidth name="settings-search" value={query} onChange={setQuery} variant="secondary" className="mb-8">
        <Label className="sr-only">{searchLabel}</Label>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder={searchLabel} />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>

      {!hasMatches && <p className="py-8 text-center text-sm text-muted">{emptyMessage}</p>}

      {populatedGroups.map((group) => (
        <section key={group.key} hidden={!group.items.some((item) => matches(group, item))} className="mb-8">
          <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{group.label}</h2>
          <div className="overflow-hidden rounded-xl border border-separator bg-surface">
            {group.items.map((item) => {
              const rowKey = `${group.key}:${item.key}`;
              const isOpen = openKey === rowKey;
              const hasVisited = visitedKeys.has(rowKey);
              const panelId = `${id}-${group.key}-${item.key}-panel`;
              const rowContent = (
                <>
                  {item.icon && <span className="shrink-0 text-accent">{item.icon}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{item.title}</span>
                    <span className="block text-sm text-muted">{item.description}</span>
                  </span>
                  <ChevronRight size={18} className={cn('shrink-0 text-muted transition-transform', isOpen && 'rotate-90')} />
                </>
              );
              const rowClassName = 'flex w-full items-center gap-4 p-4 text-left hover:bg-default-100 focus-visible:outline-2 focus-visible:outline-accent sm:p-5';

              return (
                <div key={item.key} hidden={!matches(group, item)} className="border-b border-separator last:border-b-0">
                  {item.to ? (
                    <Link to={item.to} className={rowClassName}>{rowContent}</Link>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        onClick={() => {
                          setOpenKey(isOpen ? null : rowKey);
                          if (!isOpen) setVisitedKeys((previous) => new Set(previous).add(rowKey));
                        }}
                        className={rowClassName}
                      >
                        {rowContent}
                      </button>
                      {hasVisited && <div id={panelId} hidden={!isOpen} className="min-w-0 border-t border-separator bg-default-50 p-4 sm:p-6">{item.content}</div>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}
