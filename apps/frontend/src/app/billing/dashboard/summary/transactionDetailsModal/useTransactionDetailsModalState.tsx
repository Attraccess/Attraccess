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
import { useNumberFormatter } from '@attraccess/plugins-frontend-ui';
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

  const formatNumber = useNumberFormatter();

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
    if (!transaction?.items) return 0;
    const items = Array.isArray(transaction.items) ? transaction.items : [transaction.items];
    return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
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
    configuration,
    isUsageOpen,
    setUsageOpen,
    formatNumber,
    statusColor,
    totalItemsAmount,
  } as const;
}
