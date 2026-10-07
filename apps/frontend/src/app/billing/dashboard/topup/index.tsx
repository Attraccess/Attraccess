import {
  Alert,
  AlertContent,
  AlertTitle,
  cn,
  Form,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
  Spinner,
} from '@heroui/react';
import { Button } from '../../../../components/button';
import { PageHeader } from '../../../../components/pageHeader';
import { SumUpIcon } from '../../../../components/icons/sumup.icon';
import { Select } from '../../../../components/select';
import { TransactionProcessingCard } from './transactionProcessingStatus';
import { useBillingDashboardTopupCardState } from './useBillingDashboardTopupCardState';

export interface Props {
  className?: string;
  title?: string;
  subtitle?: string;
  desiredAmount?: number;
  onProcessingComplete?: () => void;
}

export function BillingDashboardTopupCard(props: Props) {
  const {
    className,
    title,
    subtitle,
    onProcessingComplete,
    t,
    topUpTransaction,
    setTopUpTransaction,
    configuration,
    sumUpConfiguration,
    isLoadingSumUpConfiguration,
    isSumUpConfigurationError,
    readers,
    isPendingTopUpWithSumUpReader,
    amount,
    setAmount,
    readerId,
    setReaderId,
    onSubmit,
    formatNumber,
  } = useBillingDashboardTopupCardState(props);

  if (isLoadingSumUpConfiguration) {
    return (
      <div className={cn('w-full flex flex-col gap-6', className)}>
        <PageHeader title={title ?? t('title')} subtitle={subtitle ?? t('subtitle')} icon={<SumUpIcon />} noMargin />
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      </div>
    );
  }

  if (isSumUpConfigurationError || !sumUpConfiguration?.enabled) {
    return (
      <div className={cn('w-full flex flex-col gap-6', className)}>
        <PageHeader title={title ?? t('title')} subtitle={subtitle ?? t('subtitle')} icon={<SumUpIcon />} noMargin />
        <Alert status={isSumUpConfigurationError ? 'danger' : 'warning'}>
          <AlertContent>
            <AlertTitle>{t('unavailable.title')}</AlertTitle>
          </AlertContent>
          <p className="text-sm">{t('unavailable.description')}</p>
        </Alert>
      </div>
    );
  }

  if (topUpTransaction) {
    return (
      <TransactionProcessingCard
        transactionId={topUpTransaction?.id}
        onProcessingComplete={() => {
          setTopUpTransaction(null);
          onProcessingComplete?.();
        }}
      />
    );
  }

  return (
    <div className={cn('w-full flex flex-col gap-6', className)}>
      <PageHeader title={title ?? t('title')} subtitle={subtitle ?? t('subtitle')} icon={<SumUpIcon />} noMargin />

      <Form
        className="gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {(readers ?? []).length > 1 && (
          <Select
            items={readers?.map((reader) => ({ key: reader.id, label: reader.name })) ?? []}
            label={t('inputs.reader.label')}
            value={readerId}
            onChange={(key) => setReaderId(key as string)}
          />
        )}

        <NumberField
          aria-label={t('inputs.amount.label')}
          value={amount}
          onChange={(value) => setAmount(value)}
          minValue={1}
        >
          <NumberFieldGroup>
            <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
            <NumberFieldInput />
            <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
          </NumberFieldGroup>
        </NumberField>
        <input type="submit" hidden />
      </Form>

      <Alert status="warning">
        <AlertContent>
          <AlertTitle>{t('topUpInstructions.title')}</AlertTitle>
        </AlertContent>
        <p className="max-w-[600px] text-sm whitespace-pre-wrap text-wrap">{t('topUpInstructions.description')}</p>
      </Alert>

      <div className="flex justify-end">
        <Button
          variant="primary"
          onPress={onSubmit}
          isPending={isPendingTopUpWithSumUpReader}
          isDisabled={!readerId || amount === 0}
        >
          {t('actions.topUp', { amount: formatNumber(amount), currency: configuration?.currency })}
        </Button>
      </div>
    </div>
  );
}
