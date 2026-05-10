import { Button, Card, CardContent, CardFooter, CardHeader, Chip, Spinner } from '@heroui/react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../../components/pageHeader';
import { EmptyState } from '../../../../components/emptyState';
import {
  useResourceFormsServiceResourceFormsList,
  useResourcesServiceGetOneResourceById,
} from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';
import { DateTimeDisplay } from '@attraccess/plugins-frontend-ui';

export function FormListPage() {
  const { id } = useParams<{ id: string }>();
  const resourceId = Number(id);
  const navigate = useNavigate();
  const { t } = useTranslations({ en, de });

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });
  const {
    data: forms,
    isLoading,
    isFetched,
  } = useResourceFormsServiceResourceFormsList({ resourceId }, undefined, {
    enabled: Number.isFinite(resourceId),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('list.title', { resourceName: resource?.name ?? '' })}
        subtitle={t('list.subtitle')}
        backTo={`/resources/${resourceId}`}
        actions={
          <Button variant="primary">
            {t('list.create')}
          </Button>
        }
      />

      {isLoading && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {!isLoading && (!forms || forms.length === 0) && isFetched && (
        <EmptyState message={`${t('list.emptyTitle')} · ${t('list.emptyDescription')}`} />
      )}

      {forms && forms.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {forms.map((form) => (
            <Card
              key={form.id}

              onClick={() => navigate(`/resources/${resourceId}/forms/${form.id}`)}
              className="border border-default-200 dark:border-default-100"
            >
              <CardHeader className="flex flex-col items-start gap-2">
                <p className="text-base font-semibold text-default-700">{form.name}</p>
                <div className="flex flex-wrap gap-2">
                  {form.isRequiredOnResourceUsageStart && (
                    <Chip color="accent" variant="soft">
                      {t('list.badges.start')}
                    </Chip>
                  )}
                  {form.isRequiredOnResourceUsageTakeOver && (
                    <Chip color="warning" variant="soft">
                      {t('list.badges.takeover')}
                    </Chip>
                  )}
                  {form.isRequiredOnResourceUsageEnd && (
                    <Chip color="default" variant="soft">
                      {t('list.badges.end')}
                    </Chip>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-default-500">{t('list.fieldCount', { count: form.fields.length })}</p>
              </CardContent>
              <CardFooter className="flex justify-between text-xs text-default-400">
                <span>{t('list.updated')}</span>
                <DateTimeDisplay date={form.updatedAt} />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
