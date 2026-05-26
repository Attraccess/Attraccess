import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Form,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
  useOverlayState,
} from '@heroui/react';
import { Button } from '../../../../../../components/button';
import { StandardDrawer } from '../../../../../../components/standardDrawer';
import en from './en.json';
import de from './de.json';
import { useCallback, useEffect, useState } from 'react';
import {
  UseBillingServiceGetBillingBalanceKeyFn,
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetBillingTransaction,
  UseBillingServiceGetBillingTransactionKeyFn,
  useBillingServiceGetBillingTransactionsKey,
  useBillingServiceRefundTransaction,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { dbCurrencyToUserCurrency, userCurrencyToDbCurrency } from '@attraccess/shared';
import { useAuth } from '../../../../../../hooks/useAuth';
import API_ERROR_TRANSLATIONS_DE from '../../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../../global-translations/api-errors.en.json';

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
  transactionId: number;
}

export function RefundModal(props: Props) {
  const { children, transactionId } = props;

  const { t, tExists } = useTranslations({
    en: {
      ...en,
      api: API_ERROR_TRANSLATIONS_EN,
    },
    de: {
      ...de,
      api: API_ERROR_TRANSLATIONS_DE,
    },
  });

  const { open, isOpen, setOpen, close } = useOverlayState();
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: transaction } = useBillingServiceGetBillingTransaction({ transactionId });

  const [amount, setAmount] = useState(0);

  const { hasPermission } = useAuth();

  useEffect(() => {
    if (!transaction) {
      return;
    }

    setAmount(Math.abs(transaction.amount));
  }, [transaction]);

  const { mutate: refundTransaction, isPending: isRefunding } = useBillingServiceRefundTransaction({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [useBillingServiceGetBillingTransactionsKey] });
      queryClient.invalidateQueries({ queryKey: UseBillingServiceGetBillingTransactionKeyFn({ transactionId }) });
      queryClient.invalidateQueries({
        queryKey: UseBillingServiceGetBillingBalanceKeyFn({ userId: transaction?.userId ?? 0 }),
      });
      close();
    },
    onError: (error) => {
      toast.apiError({
        error: error as Error,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
  });

  const onSubmit = useCallback(() => {
    refundTransaction({ requestBody: { amount }, transactionId });
  }, [refundTransaction, amount, transactionId]);

  const { data: configuration } = useBillingServiceGetBillingConfiguration();

  if (!hasPermission('canManageBilling')) {
    return null;
  }

  if (!configuration || !transaction) {
    return null;
  }

  return (
    <>
      {children && children(open)}
      <StandardDrawer isOpen={isOpen} onOpenChange={setOpen}>
        <DrawerHeader>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
        </DrawerHeader>

        <DrawerBody>
          <Form onSubmit={onSubmit} className="flex flex-col gap-4">
            <NumberField
              aria-label={t('inputs.amount')}
              value={dbCurrencyToUserCurrency(amount, configuration.minorUnit)}
              onChange={(value) => setAmount(userCurrencyToDbCurrency(value, configuration.minorUnit))}
              minValue={0}
              maxValue={dbCurrencyToUserCurrency(Math.abs(transaction.amount), configuration.minorUnit)}
            >
              <NumberFieldGroup>
                <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
                <NumberFieldInput />
                <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
              </NumberFieldGroup>
            </NumberField>
            <input type="submit" hidden />
          </Form>
        </DrawerBody>

        <DrawerFooter>
          <Button variant="primary" onPress={onSubmit} isPending={isRefunding}>
            {t('actions.refund')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>
    </>
  );
}
