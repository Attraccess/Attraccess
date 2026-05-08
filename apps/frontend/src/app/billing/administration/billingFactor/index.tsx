import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { NumberInput } from "../../../../utils/heroui-compat";
import { Button, Card, CardContent, CardFooter, CardHeader, CardProps } from "@heroui/react";
import { PageHeader } from '../../../../components/pageHeader';
import { useToastMessage } from '../../../../components/toastProvider';
import { HandCoinsIcon, PercentIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import en from './en.json';
import de from './de.json';
import { useQueryClient } from '@tanstack/react-query';
import {
  UseUsersServiceGetOneUserByIdKeyFn,
  useUsersServiceChangeUserBillingFactor,
  useUsersServiceGetOneUserById,
} from '@attraccess/react-query-client';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';

interface Props {
  userId?: number;
}

export function ManageBillingFactorCard(props: Props & Omit<CardProps, 'children'>) {
  const { userId, ...cardProps } = props;

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
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: user } = useUsersServiceGetOneUserById({ id: userId as number }, undefined, { enabled: !!userId });

  const [value, setValue] = useState(user?.billingFactor ?? 100);
  useEffect(() => {
    setValue(user?.billingFactor ?? 100);
  }, [user]);

  const { mutate: changeBillingFactor, isPending: isChangingBillingFactor } = useUsersServiceChangeUserBillingFactor({
    onSuccess: () => {
      toast.success({
        title: t('success.toast.title'),
        description: t('success.toast.description'),
      });

      queryClient.invalidateQueries({
        queryKey: UseUsersServiceGetOneUserByIdKeyFn({ id: userId as number }),
      });
    },
    onError: (error: Error) => {
      toast.apiError({
        error,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
  });

  const handleUpdate = useCallback(() => {
    if (!userId) {
      return;
    }

    changeBillingFactor({ id: userId, requestBody: { billingFactor: value } });
  }, [changeBillingFactor, userId, value]);

  return (
    <Card {...cardProps}>
      <CardHeader>
        <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<HandCoinsIcon />} noMargin />
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <NumberInput
          label={t('inputs.amount')}
          value={value}
          onValueChange={setValue}
          minValue={0}
          endContent={<PercentIcon />}
        />
      </CardContent>

      <CardFooter>
        <Button color="primary" onPress={handleUpdate} isLoading={isChangingBillingFactor}>
          {t('actions.update')}
        </Button>
      </CardFooter>
    </Card>
  );
}
