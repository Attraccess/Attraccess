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
import { Button } from '../../../components/button';
import { Save } from 'lucide-react';
import { PageHeader } from '../../../components/pageHeader';
import { DocumentationType } from '@attraccess/react-query-client';
import { Markdown } from '../../../components/markdown';
import { useDocumentationEditorComponentState } from './useDocumentationEditorComponentState';
type Props = Pick<
  ReturnType<typeof useDocumentationEditorComponentState>,
  | 't'
  | 'resource'
  | 'resourceId'
  | 'updateResource'
  | 'handleSave'
  | 'handleSubmit'
  | 'documentationType'
  | 'setDocumentationType'
  | 'selectedTab'
  | 'setSelectedTab'
  | 'markdownContent'
  | 'setMarkdownContent'
  | 'validationErrors'
  | 'urlContent'
  | 'setUrlContent'
  | 'navigate'
>;
export function DocumentationEditorComponentDocumentationEditorPage({
  t,
  resource,
  resourceId,
  updateResource,
  handleSave,
  handleSubmit,
  documentationType,
  setDocumentationType,
  selectedTab,
  setSelectedTab,
  markdownContent,
  setMarkdownContent,
  validationErrors,
  urlContent,
  setUrlContent,
  navigate,
}: Props) {
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
            onChange={setDocumentationType as (value: string) => void}
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
              onSelectionChange={(k) => setSelectedTab(k as 'edit' | 'preview')}
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
                  onChange={setMarkdownContent}
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
              onChange={setUrlContent}
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
