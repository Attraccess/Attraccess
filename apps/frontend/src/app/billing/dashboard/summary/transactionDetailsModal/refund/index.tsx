import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Button,
  Form,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  NumberInput,
  Textarea,
  useDisclosure,
} from '@heroui/react';
import { PageHeader } from '../../../../../../components/pageHeader';
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

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
  transactionId: number;
}

export function RefundModal(props: Props) {
  const { children, transactionId } = props;

  const { t, tExists } = useTranslations({ en, de });

  const { onOpen, isOpen, onOpenChange, onClose } = useDisclosure();
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: transaction } = useBillingServiceGetBillingTransaction({ transactionId });

  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');

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
      onClose();
    },
    onError: (error) => {
      toast.apiError({
        error: error as Error,
        t,
        tExists,
        baseTranslationKey: 'error.toast',
      });
    },
  });

  const onSubmit = useCallback(() => {
    refundTransaction({ requestBody: { amount, reason }, transactionId });
  }, [refundTransaction, amount, reason, transactionId]);

  const { data: configuration } = useBillingServiceGetBillingConfiguration();

  if (!hasPermission('canManageBilling')) {
    return null;
  }

  if (!configuration || !transaction) {
    return null;
  }

  return (
    <>
      {children && children(onOpen)}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="xs" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>
            <PageHeader title={t('title')} noMargin />
          </ModalHeader>

          <ModalBody>
            <Form onSubmit={onSubmit}>
              <NumberInput
                label={t('inputs.amount')}
                value={dbCurrencyToUserCurrency(amount, configuration.minorUnit)}
                onValueChange={(value) => setAmount(userCurrencyToDbCurrency(value, configuration.minorUnit))}
                minValue={0}
                maxValue={dbCurrencyToUserCurrency(Math.abs(transaction.amount), configuration.minorUnit)}
              />
              <Textarea label={t('inputs.reason')} value={reason} onValueChange={(value) => setReason(value)} />
              <input type="submit" hidden />
            </Form>
          </ModalBody>

          <ModalFooter>
            <Button color="primary" onPress={onSubmit} isLoading={isRefunding}>
              {t('actions.refund')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
