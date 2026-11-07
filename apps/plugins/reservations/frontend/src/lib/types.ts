import type { BookableHours } from './time';

export type ReservationStatus =
  'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'expired' | 'no_show' | 'completed';
export type WhoCanBook = 'can-start' | 'managers-only' | 'any-user';

export interface Reservation {
  id: number;
  resourceId: number;
  resourceName: string | null;
  startTime: string;
  endTime: string;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  status: ReservationStatus;
  mine: boolean;
  userId: number | null;
  userName: string | null;
  note: string | null;
  createdAt: string | null;
  endedEarlyAt: string | null;
  cancelledBy: number | null;
  cancelReason: string | null;
  decidedBy: number | null;
  decisionReason: string | null;
  decidedAt: string | null;
  checkedInAt: string | null;
  canCancel: boolean;
  canEndEarly: boolean;
  canKeep: boolean;
  canDecide: boolean;
}

export interface BookingRules {
  approvalRequired: boolean;
  timeStepMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  maxAdvanceDays: number;
  minLeadMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  maxActiveBookingsPerUser: number;
  whoCanBook: WhoCanBook;
  checkInEnabled: boolean;
  checkInGraceMinutes: number;
  earlyCheckInMinutes: number;
  bookableHours: BookableHours;
}

export interface MaintenanceSpan {
  startTime: string;
  endTime: string | null;
}

export interface Availability {
  resourceId: number;
  enabled: boolean;
  timezone: string;
  isManager: boolean;
  canBook: { allowed: boolean; reason: string | null };
  rules: BookingRules;
  reservations: Reservation[];
  maintenance: MaintenanceSpan[];
}

export interface ManagedReservationList {
  items: Reservation[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ResourceSettings {
  resourceId: number;
  enabled: boolean;
  approvalRequired: boolean;
  timeStepMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  maxAdvanceDays: number;
  minLeadMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  maxActiveBookingsPerUser: number;
  whoCanBook: WhoCanBook;
  confirmWindowMinutes: number;
  checkInEnabled: boolean;
  checkInGraceMinutes: number;
  earlyCheckInMinutes: number;
  handoverReminderMinutes: number;
  showNamesOnReaders: boolean;
  bookableHours: BookableHours;
}

export type ResourceSettingsValues = Omit<ResourceSettings, 'resourceId'>;

export interface IcalSelection {
  resourceIds: number[];
  groupIds: number[];
  introduced: boolean;
  maintained: boolean;
  ownOnly: boolean;
}

export interface IcalFeed {
  id: number;
  name: string;
  selection: IcalSelection;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  tokenPrefix: string;
}

export interface IcalFeedSecret {
  feed: IcalFeed;
  url: string;
  token: string;
}

export interface NamedEntity {
  id: number;
  name: string;
}
