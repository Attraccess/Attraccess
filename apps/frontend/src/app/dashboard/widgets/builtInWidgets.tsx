import { ComponentType } from 'react';
import type { DashboardWidgetRenderProps } from '@attraccess/plugins-frontend-sdk';
import {
  ActivityIcon,
  CreditCardIcon,
  DatabaseIcon,
  LucideProps,
  MessageSquareIcon,
  ScanLineIcon,
  TimerIcon,
  UsersIcon,
} from 'lucide-react';
import { TileSize } from '../sizes';
import { BalanceWidget } from './BalanceWidget';
import { BuiltInGalleryGroupId } from './groups';
import { BuiltInWidgetId } from './ids';
import { MessagesUnreadChip, MessagesWidget } from './MessagesWidget';
import { MySessionsWidget } from './MySessionsWidget';
import { ReadersWidget } from './ReadersWidget';
import { ResourcesInUseWidget } from './ResourcesInUseWidget';
import { ResourcesWidget } from './ResourcesWidget';
import { UnverifiedUsersChip, UsersWidget } from './UsersWidget';

export interface BuiltInWidget {
  id: BuiltInWidgetId;
  icon: ComponentType<LucideProps>;
  /** The page the widget stands for and its header links to. It is offered to users who may open it, license included. */
  page: string;
  group: BuiltInGalleryGroupId;
  sizes: TileSize[];
  defaultSize: TileSize;
  hasFields?: boolean;
  Body: ComponentType<DashboardWidgetRenderProps>;
  HeaderExtra?: ComponentType<DashboardWidgetRenderProps>;
}

const ALL_SIZES: TileSize[] = ['small', 'medium', 'large'];

/**
 * The built-in widgets, in their gallery order within each group. Titles, descriptions and search keywords:
 * widgets/en.json `<id>.title`, `<id>.description` and `<id>.keywords`.
 */
export const BUILT_IN_WIDGETS: readonly BuiltInWidget[] = [
  {
    id: 'messages',
    icon: MessageSquareIcon,
    page: '/messages',
    group: 'messages',
    sizes: ALL_SIZES,
    defaultSize: 'medium',
    Body: MessagesWidget,
    HeaderExtra: MessagesUnreadChip,
  },
  {
    id: 'my-sessions',
    icon: TimerIcon,
    page: '/resources',
    group: 'resources',
    sizes: ALL_SIZES,
    defaultSize: 'medium',
    Body: MySessionsWidget,
  },
  {
    id: 'resources-in-use',
    icon: ActivityIcon,
    page: '/resources',
    group: 'resources',
    sizes: ALL_SIZES,
    defaultSize: 'medium',
    Body: ResourcesInUseWidget,
  },
  {
    id: 'resources',
    icon: DatabaseIcon,
    page: '/resources',
    group: 'resources',
    sizes: ['medium', 'large'],
    defaultSize: 'medium',
    hasFields: true,
    Body: ResourcesWidget,
  },
  {
    id: 'users',
    icon: UsersIcon,
    page: '/users',
    group: 'users',
    sizes: ['medium', 'large'],
    defaultSize: 'medium',
    hasFields: true,
    Body: UsersWidget,
    HeaderExtra: UnverifiedUsersChip,
  },
  {
    id: 'billing-balance',
    icon: CreditCardIcon,
    page: '/billing',
    group: 'billing',
    sizes: ['small', 'medium'],
    defaultSize: 'small',
    Body: BalanceWidget,
  },
  {
    id: 'readers',
    icon: ScanLineIcon,
    page: '/attractap/readers',
    group: 'attractap',
    sizes: ['small', 'medium'],
    defaultSize: 'small',
    Body: ReadersWidget,
  },
];
