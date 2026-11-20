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
  /** Hidden tabs are not offered and never active. Redirecting away from their URLs is up to the page. */
  hidden?: boolean;
}

export interface RoutedTabsProps {
  items: readonly RoutedTabItem[];
  /** The route the tab paths hang off, without a trailing slash, e.g. `/resources/7` or `/matter`. */
  basePath: string;
  /** Names the tab list and the picker. */
  'aria-label': string;
  /**
   * The tab shown as selected while no visible tab matches the location (e.g. before the page redirects); defaults to
   * the first visible tab. Always selecting a tab keeps HeroUI's tabs from picking one themselves and navigating.
   */
  fallbackKey?: string;
  /** Marks the tab list; the picker gets `<data-cy>-mobile-picker`, its options `select-item-<key>`. */
  'data-cy'?: string;
  className?: string;
}

/**
 * Renders the visible items. The active tab follows the location: the first segment below `basePath` is matched
 * against the items' `path`, so nested URLs such as `/matter/devices/<id>` keep their tab selected. Choosing a tab
 * navigates and pushes a history entry; choosing the active tab on a nested URL goes back to the tab's own path.
 * Below `sm` the same items are a `Select`; option text is the label when that is a string, else the key.
 */
export function RoutedTabs({
  items,
  basePath,
  fallbackKey,
  className,
  'aria-label': ariaLabel,
  'data-cy': dataCy,
}: RoutedTabsProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const visible = items.filter((item) => !item.hidden);
  const matched = activeRoutedTab(visible, basePath, location.pathname)?.key;
  const fallback = visible.find((item) => item.key === fallbackKey) ?? visible[0];
  const activeKey = matched ?? fallback?.key ?? null;

  const select = (key: string | number | null) => {
    const next = visible.find((item) => item.key === key);
    if (next) navigate(routedTabPath(basePath, next.path));
  };
  /**
   * The picker reports no change when its selected option is chosen again, so a nested URL would stay open. Tabs do
   * report it (React Aria fires the selection again), so `select` already covers them.
   */
  const reselect = (item: RoutedTabItem) => {
    const path = routedTabPath(basePath, item.path);
    if (item.key === activeKey && location.pathname !== path) navigate(path);
  };
  const textOf = (item: RoutedTabItem) => (typeof item.label === 'string' ? item.label : item.key);

  return (
    <div className={className}>
      <div className="sm:hidden">
        <Select
          aria-label={ariaLabel}
          value={activeKey}
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
                <ListBoxItem
                  key={item.key}
                  id={item.key}
                  textValue={textOf(item)}
                  onPress={() => reselect(item)}
                  data-cy={`select-item-${item.key}`}
                >
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
                  <span className="flex items-center gap-2 whitespace-nowrap">
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
