import {
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  CardProps,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableColumn,
  Button,
  NumberInput,
  cn,
  Skeleton,
} from '@heroui/react';
import { CreditCard, Edit2Icon, Info } from 'lucide-react';
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
import { apiCurrencyToFrontendCurrency } from '../../../../utils/currency';

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

  const { user: currentUser } = useAuth();
  const { data: balance } = useBillingServiceGetBillingBalance({ userId: currentUser?.id ?? 0 }, undefined, {
    refetchInterval: 5000,
  });

  const adjustedBalance = useMemo(() => {
    if (!configuration) {
      return 0;
    }

    return apiCurrencyToFrontendCurrency(balance?.value ?? 0, configuration.minorUnit);
  }, [balance, configuration]);

  const creditsPerUsage = useMemo(() => {
    if (!configuration) {
      return 0;
    }

    return apiCurrencyToFrontendCurrency(resourceBillingConfiguration?.creditsPerUsage ?? 0, configuration.minorUnit);
  }, [resourceBillingConfiguration, configuration]);

  const creditsPerMinute = useMemo(() => {
    if (!configuration) {
      return 0;
    }

    return apiCurrencyToFrontendCurrency(resourceBillingConfiguration?.creditsPerMinute ?? 0, configuration.minorUnit);
  }, [resourceBillingConfiguration, configuration]);

  const isFree = useMemo(() => {
    return creditsPerUsage === 0 && creditsPerMinute === 0;
  }, [creditsPerUsage, creditsPerMinute]);

  const [exampleMinutes, setExampleMinutes] = useState(10);

  const exampleCost = useMemo(
    () => creditsPerUsage + creditsPerMinute * exampleMinutes,
    [creditsPerUsage, creditsPerMinute, exampleMinutes],
  );

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

  return (
    <Card {...cardProps}>
      <CardHeader className="flex items-center justify-between py-3">
        <PageHeader
          title={t('title')}
          icon={<CreditCard />}
          actions={
            <>
              {isFree && (
                <Chip color="success" variant="flat" size="sm">
                  {t('free.title')}
                </Chip>
              )}
              <ResourceBillingInfoEditor resourceId={resourceId}>
                {(onOpen) => (
                  <Button
                    size="sm"
                    color="primary"
                    isIconOnly
                    startContent={<Edit2Icon size={12} />}
                    onPress={onOpen}
                  />
                )}
              </ResourceBillingInfoEditor>
            </>
          }
          noMargin
        />
      </CardHeader>

      {isFree ? (
        <>
          <Divider />
          <CardBody>
            <div className="flex items-center gap-3 text-success">
              <Info className="w-5 h-5" />
              <div className="flex flex-col">
                <span className="font-medium">{t('free.title')}</span>
                <span className="text-default-500 text-sm">{t('free.description')}</span>
              </div>
            </div>
          </CardBody>
        </>
      ) : (
        <>
          <Divider />
          <CardBody>
            <Table removeWrapper hideHeader>
              <TableHeader>
                <TableColumn> </TableColumn>
                <TableColumn align="end"> </TableColumn>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>{t('balance.label')}</TableCell>
                  <TableCell className={cn(adjustedBalance < 0 ? 'text-danger' : 'text-success')}>
                    {t('balance.value', {
                      credits: formatNumber(adjustedBalance),
                      currency: configuration.currency,
                    })}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{t('perUse.label')}</TableCell>
                  <TableCell className="text-warning">
                    {t('perUse.value', { credits: formatNumber(creditsPerUsage), currency: configuration.currency })}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{t('perMinute.label')}</TableCell>
                  <TableCell className="text-warning">
                    {t('perMinute.value', {
                      credits: formatNumber(creditsPerMinute),
                      currency: configuration.currency,
                    })}
                  </TableCell>
                </TableRow>
                <TableRow className="border-b border-divider border-t">
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
                    {t('example.value', {
                      credits: formatNumber(exampleCost),
                      currency: configuration.currency,
                      minutes: exampleMinutes,
                    })}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{t('exampleResultingBalance.label')}</TableCell>
                  <TableCell className={cn(exampleResultingBalance < 0 ? 'text-danger' : 'text-success')}>
                    {t('exampleResultingBalance.value', {
                      credits: formatNumber(exampleResultingBalance),
                      currency: configuration.currency,
                    })}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardBody>
        </>
      )}
    </Card>
  );
}
