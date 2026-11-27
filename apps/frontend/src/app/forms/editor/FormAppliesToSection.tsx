import {
  Chip,
  Link,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { EmptyState, useTranslations } from '@attraccess/plugins-frontend-ui';
import type { FormAppliedResourceDto } from '@attraccess/react-query-client';
import en from '../en.json';
import de from '../de.json';

interface FormAppliesToSectionProps {
  resources: FormAppliedResourceDto[];
}

/** The resources a saved form reaches by its scope, with their switch-off and override state. */
export function FormAppliesToSection({ resources }: Readonly<FormAppliesToSectionProps>) {
  const { t } = useTranslations({ en, de });
  const active = resources.filter((resource) => !resource.disabled).length;
  const switchedOff = resources.length - active;
  const requiredAt = (resource: FormAppliedResourceDto) =>
    (
      [
        ['isRequiredOnResourceUsageStart', 'appliesTo.badges.start'],
        ['isRequiredOnResourceUsageTakeOver', 'appliesTo.badges.takeover'],
        ['isRequiredOnResourceUsageEnd', 'appliesTo.badges.end'],
        ['isRequiredOnResourceUsageProjectSwitch', 'appliesTo.badges.projectSwitch'],
      ] as const
    )
      .filter(([flag]) => resource.effective[flag])
      .map(([, key]) => t(key));

  return (
    <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200" data-cy="form-editor-applies-to">
      <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
        {t('appliesTo.title', { count: active })}
        {switchedOff > 0 && ` · ${t('appliesTo.switchedOff', { count: switchedOff })}`}
      </h3>
      <Table>
        <TableScrollContainer>
          <TableContent aria-label={t('appliesTo.tableLabel')}>
            <TableHeader>
              <TableColumn isRowHeader>{t('appliesTo.resource')}</TableColumn>
              <TableColumn>{t('appliesTo.state')}</TableColumn>
              <TableColumn>{t('appliesTo.effective')}</TableColumn>
            </TableHeader>
            <TableBody items={resources} renderEmptyState={() => <EmptyState message={t('appliesTo.empty')} />}>
              {(resource) => (
                <TableRow id={resource.resourceId}>
                  <TableCell>
                    <Link href={`/resources/${resource.resourceId}/forms`}>{resource.resourceName}</Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {resource.disabled && (
                        <Chip color="default" variant="soft">
                          {t('appliesTo.disabled')}
                        </Chip>
                      )}
                      {!resource.disabled && resource.override && (
                        <Chip color="accent" variant="soft">
                          {t('appliesTo.overridden')}
                        </Chip>
                      )}
                      {!resource.disabled && !resource.override && (
                        <span className="text-sm text-muted">{t('appliesTo.inherited')}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{resource.disabled ? '–' : requiredAt(resource).join(', ') || '–'}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>
    </section>
  );
}
