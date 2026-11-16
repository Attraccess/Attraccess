import { Dispatch, SetStateAction, useCallback } from 'react';
import {
  FieldError,
  Form,
  Input,
  Label,
  Radio,
  RadioGroup,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextArea,
  TextField,
} from '@heroui/react';
import { Save } from 'lucide-react';
import {
  DocumentationType,
  Resource,
  useResourcesServiceUpdateOneResource,
  UseResourcesServiceGetOneResourceByIdKeyFn,
  useResourcesServiceGetAllResourcesKey,
} from '@attraccess/react-query-client';
import { Markdown } from '../../../components/markdown/index';
import { useNavigate } from 'react-router-dom';
import { Button, PageHeader, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import en from './documentationEditor.en.json';
import de from './documentationEditor.de.json';
import { useQueryClient } from '@tanstack/react-query';
import { DocumentationDraft } from './documentationDraft';

/** The documentation form (type, markdown or URL) of one loaded resource. */
interface DocumentationEditorFormProps {
  resource: Resource;
  resourceId: number;
  /**
   * Held by DocumentationEditor, above its loading and error views: a background refetch that fails
   * replaces this form with the error view, and the operator's edit must still be here after Retry.
   */
  draft: DocumentationDraft;
  onDraftChange: Dispatch<SetStateAction<DocumentationDraft>>;
}

export function DocumentationEditorForm({
  resource,
  resourceId,
  draft,
  onDraftChange,
}: Readonly<DocumentationEditorFormProps>) {
  const navigate = useNavigate();
  const { success, error: showError } = useToastMessage();
  const queryClient = useQueryClient();
  const { t } = useTranslations({ en, de });

  const { documentationType, markdownContent, urlContent, selectedTab, validationErrors } = draft;
  const update = (patch: Partial<DocumentationDraft>) => onDraftChange((current) => ({ ...current, ...patch }));

  const resourceQueryKey = UseResourcesServiceGetOneResourceByIdKeyFn({ id: resourceId });

  const updateResource = useResourcesServiceUpdateOneResource({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resourceQueryKey });
      queryClient.invalidateQueries({ queryKey: [useResourcesServiceGetAllResourcesKey] });

      success({
        title: t('notifications.saveSuccess.title'),
        description: t('notifications.saveSuccess.description'),
      });

      navigate(`/resources/${resourceId}`);
    },
    onError: () => {
      showError({
        title: t('notifications.saveError.title'),
        description: t('notifications.saveError.description'),
      });
    },
  });

  const validateForm = useCallback(() => {
    const errors: Record<string, string> = {};

    if (documentationType === DocumentationType.URL && !urlContent) {
      errors.url = t('validation.urlRequired');
    }

    if (documentationType === DocumentationType.URL && urlContent) {
      try {
        new URL(urlContent);
      } catch {
        errors.url = t('validation.invalidUrl');
      }
    }

    if (documentationType === DocumentationType.MARKDOWN && !markdownContent) {
      errors.markdown = t('validation.markdownRequired');
    }

    onDraftChange((current) => ({ ...current, validationErrors: errors }));
    return Object.keys(errors).length === 0;
  }, [documentationType, markdownContent, urlContent, t, onDraftChange]);

  const handleSave = useCallback(() => {
    if (!validateForm()) {
      return;
    }

    updateResource.mutate({
      id: resourceId,
      formData: {
        documentationType: documentationType || undefined,
        documentationMarkdown: documentationType === DocumentationType.MARKDOWN ? markdownContent : undefined,
        documentationUrl: documentationType === DocumentationType.URL ? urlContent : undefined,
      },
    });
  }, [documentationType, markdownContent, resourceId, updateResource, urlContent, validateForm]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      handleSave();
    },
    [handleSave],
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8" data-cy="documentation-editor-page">
      <PageHeader
        title={t('title')}
        subtitle={resource.name}
        backTo={`/resources/${resourceId}`}
        actions={[
          {
            key: 'save',
            label: t('actions.save'),
            icon: <Save className="w-4 h-4" />,
            variant: 'primary',
            isPending: updateResource.isPending,
            onPress: handleSave,
            dataCy: 'documentation-editor-header-save-button',
          },
        ]}
      />

      <Form onSubmit={handleSubmit} className="gap-8" data-cy="documentation-editor-form">
        <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('sections.type')}</h3>
          <RadioGroup
            orientation="horizontal"
            value={documentationType}
            onChange={(value) => update({ documentationType: value as DocumentationType })}
            isDisabled={updateResource.isPending}
            data-cy="documentation-editor-type-radiogroup"
          >
            <Label className="sr-only">{t('documentationType.label')}</Label>
            <Radio value={DocumentationType.MARKDOWN} data-cy="documentation-editor-type-markdown-radio">
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                {t('documentationType.markdown')}
              </Radio.Content>
            </Radio>
            <Radio value={DocumentationType.URL} data-cy="documentation-editor-type-url-radio">
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                {t('documentationType.url')}
              </Radio.Content>
            </Radio>
          </RadioGroup>
        </section>

        {documentationType === DocumentationType.MARKDOWN && (
          <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
            <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('sections.content')}</h3>
            <Tabs
              selectedKey={selectedTab}
              onSelectionChange={(k) => update({ selectedTab: k as 'edit' | 'preview' })}
              className="w-full"
              data-cy="documentation-editor-markdown-tabs"
            >
              <Tabs.ListContainer>
                <TabList>
                  <Tab id="edit" data-cy="documentation-editor-markdown-edit-tab">
                    <Tabs.Indicator />
                    {t('edit')}
                  </Tab>
                  <Tab id="preview" data-cy="documentation-editor-markdown-preview-tab">
                    <Tabs.Indicator />
                    {t('preview')}
                  </Tab>
                </TabList>
              </Tabs.ListContainer>
              <TabPanel id="edit" className="pt-4">
                <TextField
                  value={markdownContent}
                  onChange={(value) => update({ markdownContent: value })}
                  isInvalid={!!validationErrors.markdown}
                  isDisabled={updateResource.isPending}
                  className="w-full"
                >
                  <Label className="sr-only">{t('markdownContent.label')}</Label>
                  <TextArea
                    placeholder={t('markdownContent.placeholder')}
                    className="w-full min-h-[300px] resize-y"
                    data-cy="documentation-editor-markdown-textarea"
                  />
                  {validationErrors.markdown && <FieldError>{validationErrors.markdown}</FieldError>}
                </TextField>
              </TabPanel>
              <TabPanel id="preview" className="pt-4">
                {markdownContent ? (
                  <Markdown className="border border-default-200 rounded-md p-4 min-h-[300px]">
                    {markdownContent}
                  </Markdown>
                ) : (
                  <div className="border border-default-200 rounded-md p-4 min-h-[300px]">
                    <p className="text-default-400 italic">{t('markdownContent.placeholder')}</p>
                  </div>
                )}
              </TabPanel>
            </Tabs>
          </section>
        )}

        {documentationType === DocumentationType.URL && (
          <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
            <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('sections.content')}</h3>
            <TextField
              value={urlContent}
              onChange={(value) => update({ urlContent: value })}
              isInvalid={!!validationErrors.url}
              isDisabled={updateResource.isPending}
              className="w-full"
            >
              <Label>{t('urlContent.label')}</Label>
              <Input placeholder={t('urlContent.placeholder')} data-cy="documentation-editor-url-input" />
              {validationErrors.url && <FieldError>{validationErrors.url}</FieldError>}
            </TextField>
          </section>
        )}

        <div className="flex justify-end gap-3 w-full mt-4">
          <Button
            variant="secondary"
            onPress={() => navigate(`/resources/${resourceId}`)}
            isDisabled={updateResource.isPending}
            data-cy="documentation-editor-footer-cancel-button"
          >
            {t('actions.cancel')}
          </Button>
          <Button
            variant="primary"
            type="submit"
            isPending={updateResource.isPending}
            data-cy="documentation-editor-footer-save-button"
          >
            {t('actions.save')}
          </Button>
        </div>
      </Form>
    </div>
  );
}
