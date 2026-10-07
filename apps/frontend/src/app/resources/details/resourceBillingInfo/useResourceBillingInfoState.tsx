import {
  useBillingServiceGetBillingBalance,
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetResourceBillingConfiguration,
  useLicenseServiceGetLicenseInformation,
  useResourcesServiceGetOneResourceById,
} from '@attraccess/react-query-client';
import { useNumberFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import type { Props } from './index';

export function useResourceBillingInfoState(props: Props) {
  const { resourceId, onExampleAmountChange, onVisibilityChange, className, ...htmlProps } = props;

  const { t } = useTranslations({ en, de });
  const { data: configuration } = useBillingServiceGetBillingConfiguration();
  const { data: resourceBillingConfiguration } = useBillingServiceGetResourceBillingConfiguration({ resourceId });
  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });

  const { data: license } = useLicenseServiceGetLicenseInformation();
  const formatNumber = useNumberFormatter();

  const { user: currentUser, hasPermission } = useAuth();
  const { data: balance } = useBillingServiceGetBillingBalance({ userId: currentUser?.id ?? 0 }, undefined, {
    refetchInterval: 5000,
  });

  const adjustedBalance = useMemo(() => {
    if (!configuration) {
      return 0;
    }

    return dbCurrencyToUserCurrency(balance?.value ?? 0, configuration.minorUnit);
  }, [balance, configuration]);

  const creditsPerUsage = useMemo(() => {
    if (!configuration) {
      return 0;
    }

    return dbCurrencyToUserCurrency(
      resourceBillingConfiguration?.configuration.creditsPerUsage ?? 0,
      configuration.minorUnit,
    );
  }, [resourceBillingConfiguration, configuration]);

  const creditsPerMinute = useMemo(() => {
    if (!configuration) {
      return 0;
    }

    return dbCurrencyToUserCurrency(
      resourceBillingConfiguration?.configuration.creditsPerMinute ?? 0,
      configuration.minorUnit,
    );
  }, [resourceBillingConfiguration, configuration]);

  const creditsPerOperatingMinute = useMemo(() => {
    if (!configuration) {
      return 0;
    }

    return dbCurrencyToUserCurrency(
      (resourceBillingConfiguration?.configuration as { creditsPerOperatingMinute?: number } | undefined)
        ?.creditsPerOperatingMinute ?? 0,
      configuration.minorUnit,
    );
  }, [resourceBillingConfiguration, configuration]);

  const creditsPerKwh = useMemo(() => {
    if (!configuration) {
      return 0;
    }

    return dbCurrencyToUserCurrency(
      resourceBillingConfiguration?.configuration.creditsPerKwh ?? 0,
      configuration.minorUnit,
    );
  }, [resourceBillingConfiguration, configuration]);

  const isFree = useMemo(() => {
    return (
      creditsPerUsage === 0 &&
      creditsPerMinute === 0 &&
      creditsPerOperatingMinute === 0 &&
      creditsPerKwh === 0 &&
      resourceBillingConfiguration?.additionalItems.length === 0
    );
  }, [creditsPerUsage, creditsPerMinute, creditsPerOperatingMinute, creditsPerKwh, resourceBillingConfiguration]);

  const [exampleSessionMinutes, setExampleSessionMinutes] = useState(10);
  const [exampleOperatingMinutes, setExampleOperatingMinutes] = useState(10);

  const exampleCost = useMemo(() => {
    if (!resourceBillingConfiguration || !configuration) {
      return 0;
    }

    const customFlowBillingItemsCost = dbCurrencyToUserCurrency(
      resourceBillingConfiguration.additionalItems.reduce((acc, item) => {
        return acc + item.unitPrice * item.quantity;
      }, 0),
      configuration.minorUnit,
    );

    return (
      creditsPerUsage +
      creditsPerMinute * Math.ceil(exampleSessionMinutes) +
      creditsPerOperatingMinute * Math.ceil(exampleOperatingMinutes) +
      customFlowBillingItemsCost
    );
  }, [
    creditsPerUsage,
    creditsPerMinute,
    creditsPerOperatingMinute,
    exampleSessionMinutes,
    exampleOperatingMinutes,
    resourceBillingConfiguration,
    configuration,
  ]);

  const exampleResultingBalance = useMemo(() => {
    return adjustedBalance - exampleCost;
  }, [adjustedBalance, exampleCost]);

  useEffect(() => {
    onExampleAmountChange?.(exampleCost);
  }, [exampleCost, onExampleAmountChange]);

  const isVisible = useMemo(() => {
    if (!license?.modules.includes('billing')) return false;
    if (!resourceBillingConfiguration) return false;
    if (resource?.type !== 'machine') return false;
    if (isFree && !hasPermission('billing.manage')) return false;
    return true;
  }, [license, resourceBillingConfiguration, resource, isFree, hasPermission]);

  useEffect(() => {
    onVisibilityChange?.(isVisible);
  }, [isVisible, onVisibilityChange]);
  return {
    resourceId,
    className,
    htmlProps,
    t,
    configuration,
    resourceBillingConfiguration,
    resource,
    license,
    formatNumber,
    hasPermission,
    adjustedBalance,
    creditsPerUsage,
    creditsPerMinute,
    creditsPerOperatingMinute,
    creditsPerKwh,
    isFree,
    exampleSessionMinutes,
    setExampleSessionMinutes,
    exampleOperatingMinutes,
    setExampleOperatingMinutes,
    exampleCost,
    exampleResultingBalance,
  } as const;
}
