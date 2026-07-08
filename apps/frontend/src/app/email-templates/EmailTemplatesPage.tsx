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
} from '@heroui/react';
import { Edit3, Mail } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/pageHeader';
import { EmptyState } from '../../components/emptyState';
import { TableRowActions } from '../../components/tableRowActions';

import en from './en.json';
import de from './de.json';
import { useCallback, useMemo } from 'react';

export function EmailTemplatesPage() {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();

  const { data: emailTemplates } = useEmailTemplatesServiceEmailTemplateControllerFindAll();

  const openEditor = useCallback(
    (type: string) => {
      navigate(`/emails/templates/${type}`);
    },
    [navigate],
  );

  const tableItems = useMemo(() => {
    return (emailTemplates ?? []).map((item) => ({
      key: item.type,
      type: t(`templateTypes.${item.type}`),
      subject: item.subject,
      actions: (
        <TableRowActions
          ariaLabel={t('columns.actions')}
          actions={[
            {
              key: 'edit',
              label: t('editButton'),
              icon: <Edit3 size={18} />,
              onPress: () => openEditor(item.type),
            },
          ]}
        />
      ),
    }));
  }, [emailTemplates, t, openEditor]);

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<Mail className="w-6 h-6" />}
        backTo="/emails"
      />

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
