import { useEmailTemplatesServiceEmailTemplateControllerFindAll } from '@attraccess/react-query-client';
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Button } from '@heroui/react';
import { Edit3, Mail } from 'lucide-react'; // Mail for PageHeader icon
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../components/pageHeader'; // Assuming PageHeader exists
import { Link } from 'react-router-dom'; // For edit button link
import { TableDataLoadingIndicator } from '../../components/tableComponents';
import { EmptyState } from '../../components/emptyState';
import { useReactQueryStatusToHeroUiTableLoadingState } from '../../hooks/useReactQueryStatusToHeroUiTableLoadingState';

import * as en from './en.json';
import * as de from './de.json';
import { useMemo } from 'react';

export function EmailTemplatesPage() {
  const { t } = useTranslations('emailTemplates', { en, de });
  const { data: emailTemplates, status: fetchStatus } = useEmailTemplatesServiceEmailTemplateControllerFindAll();

  const loadingState = useReactQueryStatusToHeroUiTableLoadingState(fetchStatus);

  const tableItems = useMemo(() => {
    return (emailTemplates ?? []).map((item) => ({
      key: item.type,
      type: t(`templateTypes.${item.type}`),
      subject: item.subject,
      actions: (
        <Button
          as={Link}
          to={`/email-templates/${item.type}`}
          variant="light"
          color="primary"
          isIconOnly
          aria-label={t('editButton')}
          startContent={<Edit3 size={18} />}
        />
      ),
    }));
  }, [emailTemplates, t]);

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<Mail className="w-6 h-6" />} />

      <Table aria-label="Email templates table">
        <TableHeader>
          <TableColumn>{t('columns.type')}</TableColumn>
          <TableColumn>{t('columns.subject')}</TableColumn>
          <TableColumn>{t('columns.actions')}</TableColumn>
        </TableHeader>
        <TableBody
          items={tableItems}
          loadingState={loadingState}
          loadingContent={<TableDataLoadingIndicator />}
          emptyContent={<EmptyState />}
        >
          {(item) => (
            <TableRow key={item.key}>
              <TableCell>{item.type}</TableCell>
              <TableCell>{item.subject}</TableCell>
              <TableCell>{item.actions}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </>
  );
}
