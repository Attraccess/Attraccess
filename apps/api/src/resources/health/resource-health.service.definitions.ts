// Manages resource health state tracking with mutable status and source lifecycle tracking
// FEATURE: Resource health monitoring system for subsystem-level status tracking

import { ResourceHealthSource, ResourceHealthStatus } from '@attraccess/database-entities';
import { ResourceAuditOrigin } from '../../audit/audit-policy';
export interface ReportInput {
  resourceId: number;
  identifier?: string | null;
  status: ResourceHealthStatus;
  reason?: string | null;
  source: ResourceHealthSource;
  reportedAt?: Date;
  auditOrigin?: ResourceAuditOrigin;
}
