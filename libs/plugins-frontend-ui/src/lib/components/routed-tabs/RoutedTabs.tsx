// Tab navigation whose active tab is the URL: HeroUI tabs from `sm` up, a select picker below it.
// FEATURE: one routed-tabs implementation for host pages and plugins (resource details, the Matter page)
import {
  ListBox,
  ListBoxItem,
  Select,
  SelectIndicator,
  SelectPopover,
  SelectTrigger,
  SelectValue,
  Tab,
  TabList,
  Tabs,
} from '@heroui/react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { activeRoutedTab, routedTabPath } from './routedTabPath';

export interface RoutedTabItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  /** The first path segment below `basePath` that selects this tab. Empty for the tab at `basePath` itself. */
  path: string;
  /** Hidden tabs are not offered and never active; their URLs select the first visible tab's fallback. */
  hidden?: boolean;
}

export interface RoutedTabsProps {
  items: readonly RoutedTabItem[];
  /** The route the tab paths hang off, without a trailing slash, e.g. `/resources/7` or `/matter`. */
  basePath: string;
  /** Names the tab list and the picker. */
  'aria-label': string;
  /** Text of the picker option; defaults to the label when that is a string. */
  getTextValue?: (item: RoutedTabItem) => string;
  /** Tab switches push a history entry. */
  'data-cy'?: string;
  className?: string;
}

/**
 * Renders the visible items. The active tab follows the location: the first segment below `basePath` is matched
 * against the items' `path`, so nested URLs such as `/matter/devices/<id>` keep their tab selected. Choosing a tab
 * navigates (a history entry per switch). Below `sm` the same items are a `Select`.
 */
export function RoutedTabs({
  items,
  basePath,
  getTextValue,
  className,
  'aria-label': ariaLabel,
  'data-cy': dataCy,
}: RoutedTabsProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const visible = items.filter((item) => !item.hidden);
  const activeKey = activeRoutedTab(visible, basePath, location.pathname)?.key;

  const select = (key: string | number | null) => {
    const next = visible.find((item) => item.key === key);
    if (next) navigate(routedTabPath(basePath, next.path));
  };
  const textOf = (item: RoutedTabItem) => getTextValue?.(item) ?? (typeof item.label === 'string' ? item.label : item.key);

  return (
    <div className={className}>
      <div className="sm:hidden">
        <Select
          aria-label={ariaLabel}
          value={activeKey ?? null}
          onChange={select}
          fullWidth
          data-cy={dataCy ? `${dataCy}-mobile-picker` : undefined}
        >
          <SelectTrigger>
            <SelectValue />
            <SelectIndicator />
          </SelectTrigger>
          <SelectPopover>
            <ListBox>
              {visible.map((item) => (
                <ListBoxItem key={item.key} id={item.key} textValue={textOf(item)}>
                  {item.label}
                </ListBoxItem>
              ))}
            </ListBox>
          </SelectPopover>
        </Select>
      </div>
      <div className="hidden sm:block">
        <Tabs aria-label={ariaLabel} selectedKey={activeKey} onSelectionChange={select} data-cy={dataCy}>
          <Tabs.ListContainer>
            <TabList>
              {visible.map((item) => (
                <Tab key={item.key} id={item.key}>
                  <Tabs.Indicator />
                  <span className="flex items-center gap-2">
                    {item.icon}
                    {item.label}
                  </span>
                </Tab>
              ))}
            </TabList>
          </Tabs.ListContainer>
        </Tabs>
      </div>
    </div>
  );
}
