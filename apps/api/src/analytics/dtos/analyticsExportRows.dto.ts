/*
 * The export responses carry explicit, flat email fields (`User.email` is excluded from regular responses). The
 * schema classes are declared next to the storage entities they describe, in the persistence adapter.
 *
 * The billing endpoint is guarded by `resources.update`, which on its own does not grant access to emails, so its
 * email fields are only filled for callers that also hold one of BILLING_EXPORT_EMAIL_PERMISSIONS.
 */
export {
  BillingTransactionExportRowDto,
  ResourceUsageExportRowDto,
} from '../../database/adapters/analytics/export-row-dtos';

export const BILLING_EXPORT_EMAIL_PERMISSIONS = ['billing.manage', 'resources.reports.export'] as const;
