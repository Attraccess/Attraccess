import { useEmailTemplateControllerFindAll } from '@attraccess/react-query-client';
import {
  Table,
  TableScrollContainer,
  TableContent,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
} from '@heroui/react';
import { Mail, Pencil } from 'lucide-react';
import {
  EmptyState,
  PageHeader,
  TableActionsColumnHeader,
  TableRowActions,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import { useNavigate } from 'react-router-dom';

import en from './en.json';
import de from './de.json';
import { useCallback, useMemo } from 'react';

export function EmailTemplatesPage() {
  const { t, language } = useTranslations({ en, de });
  const navigate = useNavigate();
  // The Email settings section — these editors are sub-routes of it and navigate to its siblings.
  const basePath = '/settings/email';

  const { data: emailTemplates } = useEmailTemplateControllerFindAll();

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
    return [...core, ...fromPlugins];
  }, [emailTemplates, t, language]);

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<Mail className="w-6 h-6" />} backTo={basePath} />

      <Table>
        <TableScrollContainer>
          <TableContent aria-label="Email templates table">
            <TableHeader>
              <TableColumn isRowHeader>{t('columns.type')}</TableColumn>
              <TableColumn>{t('columns.subject')}</TableColumn>
              <TableColumn>
                <TableActionsColumnHeader />
              </TableColumn>
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
                  <TableCell>
                    <TableRowActions
                      itemName={item.type}
                      actions={[
                        { key: 'edit', label: t('editButton'), icon: Pencil, onPress: () => openEditor(item.key) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>
    </>
  );
}
