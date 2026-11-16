import { ComponentType } from 'react';
import {
  CreditCardIcon,
  DatabaseIcon,
  LucideProps,
  MessageSquareIcon,
  ScanLineIcon,
  TimerIcon,
  UsersIcon,
} from 'lucide-react';
import { BalanceWidget } from './BalanceWidget';
import { BuiltInWidgetId } from './ids';
import { MessagesUnreadChip, MessagesWidget } from './MessagesWidget';
import { MySessionsWidget } from './MySessionsWidget';
import { ReadersWidget } from './ReadersWidget';
import { ResourcesWidget } from './ResourcesWidget';
import { UsersWidget } from './UsersWidget';

export interface BuiltInWidget {
  id: BuiltInWidgetId;
  icon: ComponentType<LucideProps>;
  /** The page the widget stands for. It is offered to users who may open that page, license included. */
  page: string;
  hasFields?: boolean;
  Body: ComponentType;
  HeaderExtra?: ComponentType;
}

/** The built-in widgets, in the order the "Add to dashboard" picker lists them. Titles: widgets/en.json `<id>.title`. */
export const BUILT_IN_WIDGETS: readonly BuiltInWidget[] = [
  { id: 'messages', icon: MessageSquareIcon, page: '/messages', Body: MessagesWidget, HeaderExtra: MessagesUnreadChip },
  { id: 'my-sessions', icon: TimerIcon, page: '/resources', Body: MySessionsWidget },
  { id: 'resources', icon: DatabaseIcon, page: '/resources', hasFields: true, Body: ResourcesWidget },
  { id: 'users', icon: UsersIcon, page: '/users', hasFields: true, Body: UsersWidget },
  { id: 'billing-balance', icon: CreditCardIcon, page: '/billing', Body: BalanceWidget },
  { id: 'readers', icon: ScanLineIcon, page: '/attractap/readers', Body: ReadersWidget },
];
