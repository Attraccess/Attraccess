import { useEmailTemplatesServiceEmailTemplateControllerFindAll } from '@attraccess/react-query-client';
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Button } from '@heroui/react';
import { Edit3, Mail } from 'lucide-react'; // Mail for PageHeader icon
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../components/pageHeader'; // Assuming PageHeader exists
import { Link } from 'react-router-dom'; // For edit button link
import { TableDataLoadingIndicator } from '../../components/tableComponents';
import { EmptyState } from '../../components/emptyState';

import en from './en.json';
import de from './de.json';
import { useMemo } from 'react';

export function EmailTemplatesPage() {
  const { t } = useTranslations({ en, de });
  const { data: emailTemplates, status: fetchStatus } = useEmailTemplatesServiceEmailTemplateControllerFindAll();

  const tableItems = useMemo(() => {
    return (emailTemplates ?? []).map((item) => ({
      key: item.type,
      type: t(`templateTypes.${item.type}`),
      subject: item.subject,
      actions: (
        <Button variant="ghost"
          as={Link}
          to={`/email-templates/${item.type}`}
          isIconOnly
          aria-label={t('editButton')}
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
          renderEmptyState={() => <EmptyState />}
        >
          {(item) => (
            <TableRow key={item.key} id={item.key}>
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
