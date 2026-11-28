import type { ProjectSwitchCharging, ResourceBillingConfigurationRecord } from '@attraccess/application-models';
import type { BillingTransactionContext } from './billing-ledger.port';

export const BILLING_CONFIGURATION_STORE = Symbol.for('attraccess.billing.configuration-store');

export interface ResourceRates {
  creditsPerUsage: number;
  creditsPerMinute: number;
  creditsPerOperatingMinute: number;
  projectSwitchCharging: ProjectSwitchCharging;
}

/** The instance-wide billing currency and the per-resource default prices. */
export interface BillingConfigurationStore {
  /** The stored currency code, or null when none was ever chosen. */
  getCurrency(): Promise<string | null>;

  saveCurrency(currency: string): Promise<void>;

  findResourceConfiguration(
    resourceId: number,
    context?: BillingTransactionContext,
  ): Promise<ResourceBillingConfigurationRecord | null>;

  /** The resource's configuration; a free (all zero) one is stored first when none exists. */
  getOrCreateResourceConfiguration(
    resourceId: number,
    context?: BillingTransactionContext,
  ): Promise<ResourceBillingConfigurationRecord>;

  saveResourceRates(resourceId: number, rates: ResourceRates): Promise<ResourceBillingConfigurationRecord>;

  /** Whether any meter of the resource has a price above zero. */
  hasPricedMeter(resourceId: number, context?: BillingTransactionContext): Promise<boolean>;
}
