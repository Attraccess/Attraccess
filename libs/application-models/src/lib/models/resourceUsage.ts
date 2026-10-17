import { BillingTransaction } from './billing-transaction';

import { FormSubmission } from './form';

import { Project } from './project';

import { Resource } from './resource';

import { ResourceUsageAction } from './resourceUsage.type';

import { User } from './user';

export interface ResourceUsage {
  sessionDurationCreditsPerMinute: number | null;
  operatingDurationCreditsPerMinute: number | null;
  creditsPerUsage: number | null;
  billingFactor: number | null;
  meterRates: { meterId: number; name: string; creditsPerUnit: number }[] | null;
  attributedOperatingDurationInMinutes: number | null;
  id: number;
  usageAction: ResourceUsageAction;
  resourceId: number;
  userId: number | null;
  startTime: Date;
  startNotes: string | null;
  endTime: Date | null;
  endNotes: string | null;
  resource: Resource;
  user: User | null;
  usageInMinutes: number;
  billingTransaction: BillingTransaction | null;
  projectId: number | null;
  project: Project | null;
  formSubmissions: FormSubmission[];
  isFinalized: boolean;
  /** Internal lifecycle reservation; excluded from public usage and duration calculations. */
  lifecyclePending: boolean;
  supervisorUserId: number | null;
  supervisorUser: User | null;
}
