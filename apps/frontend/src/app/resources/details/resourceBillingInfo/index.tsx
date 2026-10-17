import { Button, cn, Skeleton } from '@heroui/react';
import { CreditCard, Edit2Icon } from 'lucide-react';
import { ResourceBillingInfoEditor } from './editor';
import { Fragment } from 'react';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import { FlatSection } from '../../../../components/flatSection';
import { LiveSessionBilling } from './metering/LiveSessionBilling';
import { EnergySettlementNotices, MeterSetupNotice } from './metering/MeterNotices';
import { Props } from './useBillingDetails';
import { useBillingDetails } from './useBillingDetails';
import { BillingDetails } from './BillingDetails';

export function ResourceBillingInfo(props: Props) {
  const {
    resourceId,
    className,
    htmlProps,
    t,
    configuration,
    resourceBillingConfiguration,
    resource,
    license,
    formatNumber,
    formatCredits,
    hasPermission,
    adjustedBalance,
    creditsPerUsage,
    creditsPerMinute,
    creditsPerOperatingMinute,
    meters,
    hasMeterSessions,
    isFree,
    exampleSessionMinutes,
    setExampleSessionMinutes,
    exampleOperatingMinutes,
    setExampleOperatingMinutes,
    exampleCost,
    exampleResultingBalance,
  } = useBillingDetails(props);

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

  if (isFree && !hasMeterSessions && !hasPermission('billing.manage')) {
    return null;
  }

  const dlClass = 'grid grid-cols-2 gap-x-4 gap-y-2 text-sm items-center [&>dt]:wrap-anywhere';
  const valueClass = 'text-right min-w-0 wrap-anywhere';

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
        {meters
          .filter((meter) => meter.creditsPerUnit > 0)
          .map((meter) => (
            <Fragment key={meter.id}>
              <dt>
                {meter.name}
                <br />
                <small>{t('perUnit')}</small>
              </dt>
              <dd className={cn(valueClass, 'text-warning')}>
                {t('billingValue', {
                  credits: formatCredits(meter.creditsPerUnit),
                  currency: configuration.currency,
                })}
              </dd>
            </Fragment>
          ))}
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

      <MeterSetupNotice resourceId={resourceId} />
      <EnergySettlementNotices resourceId={resourceId} />

      <div className="border-t border-divider pt-3 empty:hidden">
        <LiveSessionBilling
          resourceId={resourceId}
          currency={configuration.currency}
          minorUnit={configuration.minorUnit}
          dlClass={dlClass}
          valueClass={valueClass}
        />
      </div>

      <dl className={cn(dlClass, 'border-t border-divider pt-3')}>
        <BillingDetails
          {...{
            t,
            exampleSessionMinutes,
            setExampleSessionMinutes,
            setExampleOperatingMinutes,
            exampleOperatingMinutes,
          }}
        />
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
