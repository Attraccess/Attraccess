import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Chip,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { PencilIcon, PlusIcon } from 'lucide-react';
import {
  AlertStatusIcon,
  EmptyState,
  PageHeader,
  TableActionsColumnHeader,
  TableRowActions,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import { FormListItemDto, FormScope, useFormsList } from '@attraccess/react-query-client';
import { useAuth } from '../../hooks/useAuth';
import { Select } from '../../components/select';
import { SimplePagination } from '../../components/simplePagination/index';
import { useScopeLabel } from './useScopeLabel';
import { scopeChipColor } from './scopeChipColor';
import en from './en.json';
import de from './de.json';

const PAGE_SIZE = 25;
const ALL = 'all';

/** Every form, of any scope, with where it applies. */
export function FormsListPage() {
  const { hasPermission } = useAuth();
  const { t } = useTranslations({ en, de });
  const scopeLabel = useScopeLabel();
  const navigate = useNavigate();
  const [scope, setScope] = useState<FormScope | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useFormsList({
    query: { page, limit: PAGE_SIZE, ...(scope ? { scope } : {}) },
  });
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  if (!hasPermission('resources.update')) {
    return <Navigate to="/" />;
  }

  return (
    <div data-cy="forms-page" className="flex flex-col gap-4">
      <PageHeader
        title={t('globalList.title')}
        subtitle={t('globalList.subtitle')}
        actions={[
          {
            key: 'create-form',
            label: t('globalList.create'),
            icon: <PlusIcon size={16} />,
            variant: 'primary',
            onPress: () => navigate('/forms/new'),
            dataCy: 'forms-create-button',
          },
        ]}
      />

      <div className="max-w-xs">
        <Select
          label={t('globalList.scopeFilter')}
          value={scope ?? ALL}
          onChange={(key) => {
            setPage(1);
            setScope(key === ALL ? null : (key as FormScope));
          }}
          items={[
            { key: ALL, label: t('globalList.allScopes') },
            ...[FormScope.RESOURCE, FormScope.GROUP, FormScope.GLOBAL].map((value) => ({
              key: value,
              label: t(`scope.${value}`),
            })),
          ]}
          data-cy="forms-scope-filter"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-4">
          <Spinner color="accent" />
        </div>
      ) : isError ? (
        <Alert status="danger">
          <AlertStatusIcon status="danger" />
          <AlertContent>
            <AlertDescription>{t('globalList.loadError')}</AlertDescription>
          </AlertContent>
        </Alert>
      ) : (
        <Table>
          <TableScrollContainer>
            <TableContent aria-label={t('globalList.tableLabel')}>
              <TableHeader>
                <TableColumn isRowHeader>{t('globalList.columns.name')}</TableColumn>
                <TableColumn>{t('globalList.columns.scope')}</TableColumn>
                <TableColumn>{t('globalList.columns.fields')}</TableColumn>
                <TableColumn>{t('globalList.columns.appliesTo')}</TableColumn>
                <TableColumn>
                  <TableActionsColumnHeader />
                </TableColumn>
              </TableHeader>
              <TableBody
                items={data?.data ?? []}
                renderEmptyState={() => (
                  <EmptyState message={scope ? t('globalList.emptyFiltered') : t('globalList.empty')} />
                )}
              >
                {(form: FormListItemDto) => (
                  <TableRow id={form.id}>
                    <TableCell>
                      <span className="font-medium">{form.name}</span>
                    </TableCell>
                    <TableCell>
                      <Chip variant="soft" color={scopeChipColor(form.scope)}>
                        {scopeLabel(form.scope, form.resourceName, form.groupName)}
                      </Chip>
                    </TableCell>
                    <TableCell>{t('globalList.fieldCount', { count: form.fields.length })}</TableCell>
                    <TableCell>{t('globalList.appliesToCount', { count: form.appliesToResourceCount })}</TableCell>
                    <TableCell>
                      <TableRowActions
                        itemName={form.name}
                        data-cy={`forms-actions-${form.id}`}
                        actions={[
                          {
                            key: 'edit',
                            label: t('globalList.editAction'),
                            icon: PencilIcon,
                            onPress: () => navigate(`/forms/${form.id}`),
                            'data-cy': `forms-edit-${form.id}`,
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </TableContent>
          </TableScrollContainer>
        </Table>
      )}
      {pages > 1 && <SimplePagination showControls page={page} total={pages} onChange={setPage} />}
    </div>
  );
}
