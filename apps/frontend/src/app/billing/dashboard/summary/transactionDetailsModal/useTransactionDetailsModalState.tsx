import { useMeterValueFormatter } from '../../../../../hooks/useMeterValueFormatter';
import { useCreditsFormatter } from '../../../../../hooks/useCreditsFormatter';
import { useOverlayState } from '@heroui/react';
import de from './de.json';
import en from './en.json';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  BillingTransaction,
  BillingTransactionStatus,
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetBillingTransaction,
} from '@attraccess/react-query-client';
import { toExactCredits } from '@attraccess/shared';
import { useEffect, useMemo, useState } from 'react';
import { TransactionDetailsModalProps } from './index.transaction-details-modal-props';
export function useTransactionDetailsModalState(props: TransactionDetailsModalProps) {
  const { children, transactionId, isOpen: isOpenProp, onClose: onCloseProp } = props;

  const { t, tExists } = useTranslations({ en, de });

  const { open, isOpen, setOpen, close } = useOverlayState({
    onOpenChange: (o) => {
      if (!o) onCloseProp?.();
    },
  });

  useEffect(() => {
    if (isOpenProp === undefined) {
      return;
    }

    if (isOpenProp) {
      open();
    } else {
      close();
    }
  }, [isOpenProp, open, close]);

  const {
    data: transaction,
    error,
    refetch,
  } = useBillingServiceGetBillingTransaction({ transactionId }, undefined, { enabled: isOpen });
  const { data: configuration } = useBillingServiceGetBillingConfiguration(undefined, { enabled: isOpen });

  const [isUsageOpen, setUsageOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) setUsageOpen(false);
  }, [isOpen]);

  const formatMeterValue = useMeterValueFormatter();
  const formatCredits = useCreditsFormatter(configuration?.minorUnit ?? 2);

  const statusColor = (status: BillingTransaction['status']) => {
    switch (status) {
      case BillingTransactionStatus.PENDING:
        return 'warning';
      case BillingTransactionStatus.COMPLETED:
        return 'success';
      case BillingTransactionStatus.FAILED:
        return 'danger';
      default:
        return 'default';
    }
  };

  const totalItemsAmount = useMemo(() => {
    if (!transaction?.items) return BigInt(0);
    const items = Array.isArray(transaction.items) ? transaction.items : [transaction.items];
    return items.reduce((sum, item) => sum + toExactCredits(item.unitPrice) * toExactCredits(item.quantity), BigInt(0));
  }, [transaction]);
  return {
    children,
    transactionId,
    t,
    tExists,
    open,
    isOpen,
    setOpen,
    transaction,
    error,
    refetch,
    isUsageOpen,
    setUsageOpen,
    formatMeterValue,
    formatCredits,
    statusColor,
    totalItemsAmount,
  };
}
