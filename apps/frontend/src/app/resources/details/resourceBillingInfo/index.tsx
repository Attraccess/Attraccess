import {
  cn,
  Label,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
  Skeleton,
} from '@heroui/react';
import { CreditCard } from 'lucide-react';
import { BillingEditorAction } from './BillingEditorAction';
import { Fragment, HTMLAttributes } from 'react';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import { FlatSection } from '../../../../components/flatSection';
import { LiveSessionBilling } from './metering/LiveSessionBilling';
import { EnergySettlementNotices, MeterSetupNotice } from './metering/MeterNotices';
import { useResourceBillingInfoState } from './useResourceBillingInfoState';

export interface Props extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  resourceId: number;
  onExampleAmountChange?: (amount: number) => void;
  /** Reports whether the component renders any content. Lets parents reclaim layout space when hidden. */
  onVisibilityChange?: (visible: boolean) => void;
}

export function ResourceBillingInfo(props: Props) {
  const model = useResourceBillingInfoState(props);

  if (!model.license?.modules.includes('billing')) {
    return null;
  }

  if (!model.resourceBillingConfiguration) {
    return null;
  }

  if (model.resource?.type !== 'machine') {
    return null;
  }

  if (!model.configuration) {
    return <Skeleton className="h-10 w-full" />;
  }

  if (model.isFree && !model.hasPermission('billing.manage')) {
    return null;
  }

  const dlClass = 'grid grid-cols-[1fr_max-content] gap-x-4 gap-y-2 text-sm items-center';
  const valueClass = 'text-right whitespace-nowrap';

  const billingContent = (
    <div className="flex flex-col gap-3">
      <dl className={dlClass} aria-label={model.t('table.ariaLabel')}>
        <dt>{model.t('balance.label')}</dt>
        <dd className={cn(valueClass, 'font-medium', model.adjustedBalance < 0 ? 'text-danger' : 'text-success')}>
          {model.t('billingValue', {
            credits: model.formatNumber(model.adjustedBalance),
            currency: model.configuration.currency,
          })}
        </dd>
      </dl>

      <dl className={cn(dlClass, 'border-t border-divider pt-3')}>
        <dt>{model.t('perUse.label')}</dt>
        <dd className={cn(valueClass, 'text-warning')}>
          {model.t('billingValue', {
            credits: model.formatNumber(model.creditsPerUsage),
            currency: model.configuration.currency,
          })}
        </dd>
        <dt>{model.t('perMinute.label')}</dt>
        <dd className={cn(valueClass, 'text-warning')}>
          {model.t('billingValue', {
            credits: model.formatNumber(model.creditsPerMinute),
            currency: model.configuration.currency,
          })}
        </dd>
        <dt>{model.t('perOperatingMinute.label')}</dt>
        <dd className={cn(valueClass, 'text-warning')}>
          {model.t('billingValue', {
            credits: model.formatNumber(model.creditsPerOperatingMinute),
            currency: model.configuration.currency,
          })}
        </dd>
        <dt>{model.t('perKwh.label')}</dt>
        <dd className={cn(valueClass, 'text-warning')}>
          {model.t('billingValue', {
            credits: model.formatNumber(model.creditsPerKwh),
            currency: model.configuration.currency,
          })}
        </dd>
        {model.resourceBillingConfiguration.additionalItems.map((item) => (
          <Fragment key={JSON.stringify(item)}>
            <dt>{item.name}</dt>
            <dd className={cn(valueClass, 'text-warning')}>
              {model.t('billingValue', {
                credits: model.formatNumber(
                  dbCurrencyToUserCurrency(item.unitPrice * item.quantity, model.configuration.minorUnit),
                ),
                currency: model.configuration.currency,
              })}
              <br />
              <small>{model.t('perUnit')}</small>
            </dd>
          </Fragment>
        ))}
      </dl>

      <MeterSetupNotice resourceId={model.resourceId} energyBillingEnabled={model.creditsPerKwh > 0} />
      <EnergySettlementNotices resourceId={model.resourceId} />

      <div className="border-t border-divider pt-3 empty:hidden">
        <LiveSessionBilling
          resourceId={model.resourceId}
          currency={model.configuration.currency}
          minorUnit={model.configuration.minorUnit}
          dlClass={dlClass}
          valueClass={valueClass}
        />
      </div>

      <dl className={cn(dlClass, 'border-t border-divider pt-3')}>
        <dt className="flex flex-col gap-2">
          <span className="font-medium">{model.t('example.label')}</span>
          <NumberField
            value={model.exampleSessionMinutes}
            onChange={(value) => {
              model.setExampleSessionMinutes(value);
              model.setExampleOperatingMinutes((operatingMinutes) => Math.min(operatingMinutes, value));
            }}
            minValue={0}
            defaultValue={10}
          >
            <Label>{model.t('example.sessionDuration.label')}</Label>
            <NumberFieldGroup>
              <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
              <NumberFieldInput />
              <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
            </NumberFieldGroup>
          </NumberField>
          <NumberField
            value={model.exampleOperatingMinutes}
            onChange={(value) => model.setExampleOperatingMinutes(value)}
            minValue={0}
            maxValue={model.exampleSessionMinutes}
            defaultValue={10}
          >
            <Label>{model.t('example.operatingDuration.label')}</Label>
            <NumberFieldGroup>
              <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
              <NumberFieldInput />
              <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
            </NumberFieldGroup>
          </NumberField>
        </dt>
        <dd className={valueClass}>
          {model.t('billingValue', {
            credits: model.formatNumber(model.exampleCost),
            currency: model.configuration.currency,
          })}
        </dd>
        <dt className="font-medium">{model.t('exampleResultingBalance.label')}</dt>
        <dd
          className={cn(
            valueClass,
            'font-semibold text-base',
            model.exampleResultingBalance < 0 ? 'text-danger' : 'text-success',
          )}
        >
          {model.t('billingValue', {
            credits: model.formatNumber(model.exampleResultingBalance),
            currency: model.configuration.currency,
          })}
        </dd>
      </dl>
    </div>
  );

  return (
    <FlatSection
      icon={<CreditCard className="w-4 h-4" />}
      title={model.t('title')}
      actions={<BillingEditorAction model={model} />}
      className={model.className}
      {...model.htmlProps}
    >
      {billingContent}
    </FlatSection>
  );
}
