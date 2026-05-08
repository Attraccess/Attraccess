import { Card, CardContent, CardHeader, CardProps, Table, TableHeader, TableBody, TableRow, TableCell, TableColumn, Button, cn, Skeleton } from "@heroui/react";
import { NumberInput } from "../../../../utils/heroui-compat";
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
import { PageHeader } from '../../../../components/pageHeader';
import { ResourceBillingInfoEditor } from './editor';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';

interface Props {
  resourceId: number;
  onExampleAmountChange?: (amount: number) => void;
}

export function ResourceBillingInfo(props: Props & Omit<CardProps, 'children'>) {
  const { resourceId, onExampleAmountChange, ...cardProps } = props;

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

  const isFree = useMemo(() => {
    return (
      creditsPerUsage === 0 && creditsPerMinute === 0 && resourceBillingConfiguration?.additionalItems.length === 0
    );
  }, [creditsPerUsage, creditsPerMinute, resourceBillingConfiguration]);

  const [exampleMinutes, setExampleMinutes] = useState(10);

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

    return creditsPerUsage + creditsPerMinute * exampleMinutes + customFlowBillingItemsCost;
  }, [creditsPerUsage, creditsPerMinute, exampleMinutes, resourceBillingConfiguration, configuration]);

  const exampleResultingBalance = useMemo(() => {
    return adjustedBalance - exampleCost;
  }, [adjustedBalance, exampleCost]);

  useEffect(() => {
    onExampleAmountChange?.(exampleCost);
  }, [exampleCost, onExampleAmountChange]);

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

  if (isFree && !hasPermission('canManageBilling')) {
    return null;
  }

  return (
    <Card {...cardProps}>
      <CardHeader className="flex items-center justify-between py-3">
        <PageHeader
          title={t('title')}
          icon={<CreditCard />}
          actions={
            <ResourceBillingInfoEditor resourceId={resourceId}>
              {(onOpen) => (
                <Button size="sm" color="primary" isIconOnly startContent={<Edit2Icon size={12} />} onPress={onOpen} />
              )}
            </ResourceBillingInfoEditor>
          }
          noMargin
        />
      </CardHeader>

      <CardContent>
        <Table hideHeader removeWrapper aria-label={t('table.ariaLabel')}>
          <TableHeader>
            <TableColumn> </TableColumn>
            <TableColumn align="end"> </TableColumn>
          </TableHeader>
          <TableBody>
            <TableRow className="border-b-4 border-divider">
              <TableCell>{t('balance.label')}</TableCell>
              <TableCell className={cn(adjustedBalance < 0 ? 'text-danger' : 'text-success')}>
                {t('billingValue', {
                  credits: formatNumber(adjustedBalance),
                  currency: configuration.currency,
                })}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>{t('perUse.label')}</TableCell>
              <TableCell className="text-warning">
                {t('billingValue', { credits: formatNumber(creditsPerUsage), currency: configuration.currency })}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>{t('perMinute.label')}</TableCell>
              <TableCell className="text-warning">
                {t('billingValue', {
                  credits: formatNumber(creditsPerMinute),
                  currency: configuration.currency,
                })}
              </TableCell>
            </TableRow>
            {
              resourceBillingConfiguration.additionalItems.map((item) => (
                <TableRow key={JSON.stringify(item)}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell className="text-warning">
                    {t('billingValue', {
                      credits: formatNumber(
                        dbCurrencyToUserCurrency(item.unitPrice * item.quantity, configuration.minorUnit),
                      ),
                      currency: configuration.currency,
                    })}
                    <br />
                    <small>{t('perUnit')}</small>
                  </TableCell>
                </TableRow>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              )) as any
            }
            <TableRow className="border-t border-b-4 border-divider">
              <TableCell>
                <NumberInput
                  size="sm"
                  value={exampleMinutes}
                  onValueChange={(value) => setExampleMinutes(value)}
                  label={t('example.label', { minutes: exampleMinutes })}
                  minValue={0}
                  defaultValue={10}
                />
              </TableCell>
              <TableCell>
                {t('billingValue', {
                  credits: formatNumber(exampleCost),
                  currency: configuration.currency,
                  minutes: exampleMinutes,
                })}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>{t('exampleResultingBalance.label')}</TableCell>
              <TableCell className={cn(exampleResultingBalance < 0 ? 'text-danger' : 'text-success')}>
                {t('billingValue', {
                  credits: formatNumber(exampleResultingBalance),
                  currency: configuration.currency,
                })}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
