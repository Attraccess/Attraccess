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
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@heroui/react';
import { Edit3, Layout, Mail } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/pageHeader';
import { EmptyState } from '../../components/emptyState';
import { EmailLayoutTab } from '../email-layout/EmailLayoutTab';

import en from './en.json';
import de from './de.json';
import { useCallback, useMemo } from 'react';

export function EmailTemplatesPage() {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTab = searchParams.get('tab') ?? 'templates';

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
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<Mail className="w-6 h-6" />}
      />

      <Tabs
        selectedKey={selectedTab}
        onSelectionChange={(key) => setSearchParams({ tab: key as string })}
      >
        <TabList>
          <Tab id="templates" key="templates">
            <div className="flex items-center gap-2">
              <Mail size={16} />
              {t('tabs.templates')}
            </div>
          </Tab>
          <Tab id="layout" key="layout">
            <div className="flex items-center gap-2">
              <Layout size={16} />
              {t('tabs.layout')}
            </div>
          </Tab>
        </TabList>

        <TabPanel id="templates" key="templates">
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
        </TabPanel>

        <TabPanel id="layout" key="layout">
          <EmailLayoutTab />
        </TabPanel>
      </Tabs>
    </>
  );
}
