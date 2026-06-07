import { useEmailTemplatesServiceEmailTemplateControllerFindAll } from '@attraccess/react-query-client';
import {
  Table,
  TableScrollContainer,
  TableContent,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Button,
} from '@heroui/react';
import { Edit3, Mail } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/pageHeader'; // Assuming PageHeader exists
import { EmptyState } from '../../components/emptyState';

import en from './en.json';
import de from './de.json';
import { useCallback, useMemo } from 'react';

export function EmailTemplatesPage() {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const { data: emailTemplates } = useEmailTemplatesServiceEmailTemplateControllerFindAll();

  const openEditor = useCallback(
    (type: string) => {
      navigate(`/email-templates/${type}`);
    },
    [navigate],
  );

  const tableItems = useMemo(() => {
    return (emailTemplates ?? []).map((item) => ({
      key: item.type,
      type: t(`templateTypes.${item.type}`),
      subject: item.subject,
      actions: (
        <Button variant="ghost" isIconOnly aria-label={t('editButton')} onPress={() => openEditor(item.type)}>
          <Edit3 size={18} />
        </Button>
      ),
    }));
  }, [emailTemplates, t, openEditor]);

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<Mail className="w-6 h-6" />} />

      <Table>
        <TableScrollContainer>
          <TableContent aria-label="Email templates table">
            <TableHeader>
              <TableColumn isRowHeader>{t('columns.type')}</TableColumn>
              <TableColumn>{t('columns.subject')}</TableColumn>
              <TableColumn>{t('columns.actions')}</TableColumn>
            </TableHeader>
            <TableBody items={tableItems} renderEmptyState={() => <EmptyState />}>
              {(item) => (
                <TableRow
                  key={item.key}
                  id={item.key}
                  className="cursor-pointer hover:bg-primary-50 transition-colors duration-300"
                  onAction={() => openEditor(item.key)}
                >
                  <TableCell>{item.type}</TableCell>
                  <TableCell>{item.subject}</TableCell>
                  <TableCell>{item.actions}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>
    </>
  );
}
