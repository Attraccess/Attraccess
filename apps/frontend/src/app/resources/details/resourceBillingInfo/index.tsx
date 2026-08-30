import {
  Button,
  cn,
  Label,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
  Skeleton,
} from '@heroui/react';
import { CreditCard, Edit2Icon } from 'lucide-react';
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
import { ResourceBillingInfoEditor } from './editor';
import { Fragment, HTMLAttributes, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import { FlatSection } from '../../../../components/flatSection';

interface Props extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  resourceId: number;
  onExampleAmountChange?: (amount: number) => void;
  /** Reports whether the component renders any content. Lets parents reclaim layout space when hidden. */
  onVisibilityChange?: (visible: boolean) => void;
}

export function ResourceBillingInfo(props: Props) {
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

  const isFree = useMemo(() => {
    return (
      creditsPerUsage === 0 &&
      creditsPerMinute === 0 &&
      creditsPerOperatingMinute === 0 &&
      resourceBillingConfiguration?.additionalItems.length === 0
    );
  }, [creditsPerUsage, creditsPerMinute, creditsPerOperatingMinute, resourceBillingConfiguration]);

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

  if (!license?.modules.includes('billing')) {
    return null;
  }

  if (!resourceBillingConfiguration) {
    return null;
  }

  if (resource?.type !== 'machine') {
    return null;
  }

  if (!configuration) {
    return <Skeleton className="h-10 w-full" />;
  }

  if (isFree && !hasPermission('billing.manage')) {
    return null;
  }

  const dlClass = 'grid grid-cols-[1fr_max-content] gap-x-4 gap-y-2 text-sm items-center';
  const valueClass = 'text-right whitespace-nowrap';

  const billingContent = (
    <div className="flex flex-col gap-3">
      <dl className={dlClass} aria-label={t('table.ariaLabel')}>
        <dt>{t('balance.label')}</dt>
        <dd className={cn(valueClass, 'font-medium', adjustedBalance < 0 ? 'text-danger' : 'text-success')}>
          {t('billingValue', {
            credits: formatNumber(adjustedBalance),
            currency: configuration.currency,
          })}
        </dd>
      </dl>

      <dl className={cn(dlClass, 'border-t border-divider pt-3')}>
        <dt>{t('perUse.label')}</dt>
        <dd className={cn(valueClass, 'text-warning')}>
          {t('billingValue', { credits: formatNumber(creditsPerUsage), currency: configuration.currency })}
        </dd>
        <dt>{t('perMinute.label')}</dt>
        <dd className={cn(valueClass, 'text-warning')}>
          {t('billingValue', {
            credits: formatNumber(creditsPerMinute),
            currency: configuration.currency,
          })}
        </dd>
        <dt>{t('perOperatingMinute.label')}</dt>
        <dd className={cn(valueClass, 'text-warning')}>
          {t('billingValue', {
            credits: formatNumber(creditsPerOperatingMinute),
            currency: configuration.currency,
          })}
        </dd>
        {resourceBillingConfiguration.additionalItems.map((item) => (
          <Fragment key={JSON.stringify(item)}>
            <dt>{item.name}</dt>
            <dd className={cn(valueClass, 'text-warning')}>
              {t('billingValue', {
                credits: formatNumber(
                  dbCurrencyToUserCurrency(item.unitPrice * item.quantity, configuration.minorUnit),
                ),
                currency: configuration.currency,
              })}
              <br />
              <small>{t('perUnit')}</small>
            </dd>
          </Fragment>
        ))}
      </dl>

      <dl className={cn(dlClass, 'border-t border-divider pt-3')}>
        <dt className="flex flex-col gap-2">
          <span className="font-medium">{t('example.label')}</span>
          <NumberField
            value={exampleSessionMinutes}
            onChange={(value) => {
              setExampleSessionMinutes(value);
              setExampleOperatingMinutes((operatingMinutes) => Math.min(operatingMinutes, value));
            }}
            minValue={0}
            defaultValue={10}
          >
            <Label>{t('example.sessionDuration.label')}</Label>
            <NumberFieldGroup>
              <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
              <NumberFieldInput />
              <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
            </NumberFieldGroup>
          </NumberField>
          <NumberField
            value={exampleOperatingMinutes}
            onChange={(value) => setExampleOperatingMinutes(value)}
            minValue={0}
            maxValue={exampleSessionMinutes}
            defaultValue={10}
          >
            <Label>{t('example.operatingDuration.label')}</Label>
            <NumberFieldGroup>
              <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
              <NumberFieldInput />
              <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
            </NumberFieldGroup>
          </NumberField>
        </dt>
        <dd className={valueClass}>
          {t('billingValue', {
            credits: formatNumber(exampleCost),
            currency: configuration.currency,
          })}
        </dd>
        <dt className="font-medium">{t('exampleResultingBalance.label')}</dt>
        <dd
          className={cn(
            valueClass,
            'font-semibold text-base',
            exampleResultingBalance < 0 ? 'text-danger' : 'text-success',
          )}
        >
          {t('billingValue', {
            credits: formatNumber(exampleResultingBalance),
            currency: configuration.currency,
          })}
        </dd>
      </dl>
    </div>
  );

  const editorAction = (
    <ResourceBillingInfoEditor resourceId={resourceId}>
      {(onOpen) => (
        <Button variant="primary" isIconOnly onPress={onOpen} aria-label={t('actions.edit')}>
          <Edit2Icon size={12} />
        </Button>
      )}
    </ResourceBillingInfoEditor>
  );

  return (
    <FlatSection
      icon={<CreditCard className="w-4 h-4" />}
      title={t('title')}
      actions={editorAction}
      className={className}
      {...htmlProps}
    >
      {billingContent}
    </FlatSection>
  );
}
