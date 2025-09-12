import { Button, Card, CardBody, CardFooter, CardHeader, CardProps, NumberInput } from '@heroui/react';
import { PageHeader } from '../../../../components/pageHeader';
import { HandCoinsIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { useCallback, useState } from 'react';
import {
  ApiError,
  useBillingServiceCreateManualTransaction,
  UseBillingServiceGetBillingBalanceKeyFn,
  useBillingServiceGetBillingTransactionsKey,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  userId?: number;
}

export function ManualTransactionsCard(props: Props & Omit<CardProps, 'children'>) {
  const { userId, ...cardProps } = props;
  const { t, tExists } = useTranslations({ en, de });

  const [amount, setAmount] = useState<number>(0);

  const queryClient = useQueryClient();
  const toast = useToastMessage();

  const { mutate: createManualTransaction, isPending: isCreatingManualTransaction } =
    useBillingServiceCreateManualTransaction({
      onSuccess: () => {
        toast.success({
          title: t('toast.success.title'),
          description: t('toast.success.description'),
        });

        queryClient.invalidateQueries({
          queryKey: [useBillingServiceGetBillingTransactionsKey],
        });
        queryClient.invalidateQueries({
          queryKey: UseBillingServiceGetBillingBalanceKeyFn({ userId: userId as number }),
        });
      },
      onError: (error: Error) => {
        const errorMessage = ((error as ApiError).body as { message?: string | string[] } | undefined)?.message;

        const baseKey = 'toast.error.';
        const translationExists = tExists(baseKey + errorMessage);

        const fullBaseKey = translationExists ? baseKey + errorMessage : baseKey + 'generic';

        toast.error({
          title: t(fullBaseKey + '.title'),
          description: t(fullBaseKey + '.description', {
            error: errorMessage,
          }),
        });
      },
    });

  const handleCreateTransaction = useCallback(() => {
    if (!userId) {
      return;
    }

    createManualTransaction({ userId: userId, requestBody: { amount } });
  }, [userId, amount, createManualTransaction]);

  return (
    <Card {...cardProps}>
      <CardHeader>
        <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<HandCoinsIcon />} noMargin />
      </CardHeader>

      <CardBody className="flex flex-col gap-4">
        <NumberInput label={t('inputs.amount')} value={amount} onValueChange={(value) => setAmount(value)} />
      </CardBody>

      <CardFooter>
        <Button color="primary" onPress={handleCreateTransaction} isLoading={isCreatingManualTransaction}>
          {t('actions.createTransaction')}
        </Button>
      </CardFooter>
    </Card>
  );
}
