import { Fragment, useState, type ReactNode } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
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
import {
  AlertStatusIcon,
  AttraccessUser,
  Button,
  DateTimeDisplay,
  EmptyState,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import { FormFieldType, FormSubmissionListItemDto, useFormsListSubmissions } from '@attraccess/react-query-client';
import { Select } from '../../../components/select';
import { SimplePagination } from '../../../components/simplePagination/index';
import en from '../en.json';
import de from '../de.json';
import { FormImageAnswer } from '../images/FormImageAnswer';

const PAGE_SIZE = 20;
const ALL = 'all';

interface FormSubmissionsPanelProps {
  formId: number;
  /** The resources to filter by: those the form reaches now. */
  resources: { id: number; name: string }[];
  resourceId: number | null;
  onResourceIdChange: (resourceId: number | null) => void;
}

type Answer = { value?: unknown; fieldDefinition?: { name?: string; position?: number; type?: FormFieldType } };

/** One stored answer as text, or as thumbnails for photos; a yes/no answer reads as in the usage history. */
function answerText(answer: Answer | undefined, t: (key: string) => string): ReactNode {
  if (answer?.value === undefined || answer?.value === null) return '';
  if (answer.fieldDefinition?.type === FormFieldType.IMAGE)
    return <FormImageAnswer value={answer.value} fieldName={answer.fieldDefinition.name} />;
  if (answer.fieldDefinition?.type === FormFieldType.BOOLEAN) {
    return String(answer.value) === 'true' ? t('submissions.yes') : t('submissions.no');
  }
  return String(answer.value);
}

/** The answers of a submission as they were given, with the field labels of that moment. */
function answersOf(submission: FormSubmissionListItemDto, t: (key: string) => string) {
  return Object.entries(submission.data as Record<string, Answer>)
    .map(([fieldId, answer]) => ({
      fieldId,
      label: answer?.fieldDefinition?.name ?? `#${fieldId}`,
      position: answer?.fieldDefinition?.position ?? Number.MAX_SAFE_INTEGER,
      value: answerText(answer, t),
    }))
    .sort((a, b) => a.position - b.position);
}

/** Submissions of a form across resources, newest first, optionally of one resource. */
export function FormSubmissionsPanel({
  formId,
  resources,
  resourceId,
  onResourceIdChange,
}: Readonly<FormSubmissionsPanelProps>) {
  const { t } = useTranslations({ en, de });
  // The filter also changes through the address (back and forward), so a page belongs to the filter it was chosen in
  // and a new filter starts on its first page.
  const [pageOfFilter, setPageOfFilter] = useState({ resourceId, page: 1 });
  const page = pageOfFilter.resourceId === resourceId ? pageOfFilter.page : 1;
  const setPage = (next: number) => setPageOfFilter({ resourceId, page: next });
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const { data, isLoading, isError } = useFormsListSubmissions({
    path: { formId },
    query: { page, limit: PAGE_SIZE, ...(resourceId === null ? {} : { resourceId }) },
  });
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const toggle = (id: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // A filtered resource the form no longer reaches still has history; keep it selectable.
  const filterItems = [
    { key: ALL, label: t('submissions.allResources') },
    ...resources.map((resource) => ({ key: String(resource.id), label: resource.name, textValue: resource.name })),
    ...(resourceId !== null && !resources.some((resource) => resource.id === resourceId)
      ? [{ key: String(resourceId), label: `#${resourceId}` }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4" data-cy="form-submissions-panel">
      <div className="max-w-xs">
        <Select
          label={t('submissions.resourceFilter')}
          value={resourceId === null ? ALL : String(resourceId)}
          onChange={(key) => onResourceIdChange(key === ALL ? null : Number(key))}
          items={filterItems}
          data-cy="form-submissions-resource-filter"
        />
      </div>
      {isLoading ? (
        <div className="flex justify-center p-4">
          <Spinner color="accent" />
        </div>
      ) : isError ? (
        <Alert status="danger">
          <AlertStatusIcon status="danger" />
          <AlertContent>
            <AlertDescription>{t('submissions.loadError')}</AlertDescription>
          </AlertContent>
        </Alert>
      ) : (
        <Table>
          <TableScrollContainer>
            <TableContent aria-label={t('submissions.tableLabel')}>
              <TableHeader>
                <TableColumn isRowHeader>{t('submissions.columns.date')}</TableColumn>
                <TableColumn>{t('submissions.columns.user')}</TableColumn>
                <TableColumn>{t('submissions.columns.resource')}</TableColumn>
                <TableColumn>{t('submissions.columns.action')}</TableColumn>
                <TableColumn>{t('submissions.columns.answers')}</TableColumn>
              </TableHeader>
              <TableBody
                items={data?.data ?? []}
                dependencies={[expanded]}
                renderEmptyState={() => <EmptyState message={t('submissions.empty')} />}
              >
                {(submission) => {
                  const answers = answersOf(submission, t);
                  const isOpen = expanded.has(submission.id);
                  return (
                    <TableRow id={submission.id}>
                      <TableCell>
                        <DateTimeDisplay date={submission.createdAt} />
                      </TableCell>
                      <TableCell>
                        {submission.user ? <AttraccessUser user={submission.user} /> : t('submissions.unknown')}
                      </TableCell>
                      <TableCell>{submission.resource?.name ?? t('submissions.unknown')}</TableCell>
                      <TableCell>{t(`submissions.actions.${submission.action}`)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onPress={() => toggle(submission.id)}
                            data-cy={`form-submission-toggle-${submission.id}`}
                          >
                            {isOpen ? t('submissions.hideAnswers') : t('submissions.showAnswers')}
                          </Button>
                          {isOpen &&
                            (answers.length === 0 ? (
                              <span className="text-sm text-muted">{t('submissions.noAnswers')}</span>
                            ) : (
                              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                                {answers.map((answer) => (
                                  <Fragment key={answer.fieldId}>
                                    <dt className="text-muted">{answer.label}</dt>
                                    <dd>{answer.value || '–'}</dd>
                                  </Fragment>
                                ))}
                              </dl>
                            ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }}
              </TableBody>
            </TableContent>
          </TableScrollContainer>
        </Table>
      )}
      {pages > 1 && <SimplePagination showControls page={page} total={pages} onChange={setPage} />}
    </div>
  );
}
