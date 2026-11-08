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
  Chip,
} from '@heroui/react';
import { Edit3, Mail } from 'lucide-react';
import { EmptyState, PageHeader, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useNavigate } from 'react-router-dom';

import en from './en.json';
import de from './de.json';
import { useCallback, useMemo } from 'react';

export function EmailTemplatesPage() {
  const { t, language } = useTranslations({ en, de });
  const navigate = useNavigate();
  // The Email settings section — these editors are sub-routes of it and navigate to its siblings.
  const basePath = '/settings/email';

  const { data: emailTemplates } = useEmailTemplatesServiceEmailTemplateControllerFindAll();

  const openEditor = useCallback(
    (type: string) => {
      navigate(`${basePath}/templates/${type}`);
    },
    [navigate, basePath],
  );

  const tableItems = useMemo(() => {
    const items = (emailTemplates ?? []).map((item) => ({
      key: item.type,
      pluginName: item.plugin?.name,
      // Core templates are named by the app's own translations, plugin templates by the plugin's label.
      type: item.plugin ? item.plugin.label[language === 'de' ? 'de' : 'en'] : t(`templateTypes.${item.type}`),
      subject: item.subject,
    }));
    // Core templates first, then each plugin's templates together under the plugin's name.
    const core = items.filter((item) => !item.pluginName);
    const fromPlugins = items
      .filter((item) => item.pluginName)
      .sort((a, b) => (a.pluginName as string).localeCompare(b.pluginName as string) || a.type.localeCompare(b.type));
    return [...core, ...fromPlugins].map((item) => ({
      ...item,
      actions: (
        <Button variant="ghost" isIconOnly aria-label={t('editButton')} onPress={() => openEditor(item.key)}>
          <Edit3 size={18} />
        </Button>
      ),
    }));
  }, [emailTemplates, t, language, openEditor]);

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<Mail className="w-6 h-6" />} backTo={basePath} />

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
                  <TableCell>
                    {item.type}
                    {item.pluginName && (
                      <Chip size="sm" variant="soft" className="ml-2" data-cy="email-template-plugin-chip">
                        {t('pluginChip', { plugin: item.pluginName })}
                      </Chip>
                    )}
                  </TableCell>
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
