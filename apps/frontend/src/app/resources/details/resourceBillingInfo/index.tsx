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
} from '@heroui/react';
import { CreditCard, Edit2Icon, Info } from 'lucide-react';
import {
  useBillingServiceGetBillingConfiguration,
  useBillingServiceGetSumUpConfiguration,
  useLicenseServiceGetLicenseInformation,
  useResourcesServiceGetOneResourceById,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';
import { PageHeader } from '../../../../components/pageHeader';
import { ResourceBillingInfoEditor } from './editor';

interface Props {
  resourceId: number;
}

export function ResourceBillingInfo(props: Props & Omit<CardProps, 'children'>) {
  const { resourceId, ...cardProps } = props;

  const { t } = useTranslations({ en, de });
  const { data: configuration } = useBillingServiceGetSumUpConfiguration();
  const { data: resourceBillingConfiguration } = useBillingServiceGetBillingConfiguration({ resourceId });
  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });

  const { data: license } = useLicenseServiceGetLicenseInformation();

  if (!license?.modules.includes('billing')) {
    return null;
  }

  if (!resourceBillingConfiguration) {
    return null;
  }

  if (resource?.type !== 'machine') {
    return null;
  }

  const creditsPerUsage = resourceBillingConfiguration.creditsPerUsage ?? 0;
  const creditsPerMinute = resourceBillingConfiguration.creditsPerMinute ?? 0;
  const isFree = creditsPerUsage === 0 && creditsPerMinute === 0;

  const exampleMinutes = 10;
  const exampleCost = creditsPerUsage + creditsPerMinute * exampleMinutes;

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
                <TableColumn> </TableColumn>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>{t('perUse.label')}</TableCell>
                  <TableCell>
                    {t('perUse.value', { credits: creditsPerUsage, currency: configuration?.currency })}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{t('perMinute.label')}</TableCell>
                  <TableCell>
                    {t('perMinute.value', { credits: creditsPerMinute, currency: configuration?.currency })}
                  </TableCell>
                </TableRow>
                <TableRow className="text-default-500">
                  <TableCell>{t('example.label')}</TableCell>
                  <TableCell>
                    {t('example.value', { credits: exampleCost, currency: configuration?.currency })}
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
