import { DocumentationType, Resource } from '@attraccess/react-query-client';

/** The unsaved state of the documentation editor form. */
export interface DocumentationDraft {
  documentationType: DocumentationType | '';
  markdownContent: string;
  urlContent: string;
  selectedTab: 'edit' | 'preview';
  validationErrors: Record<string, string>;
}

/** The editable content of a resource's stored documentation. */
export function documentationContentOf(
  resource: Resource | undefined,
): Pick<DocumentationDraft, 'documentationType' | 'markdownContent' | 'urlContent'> {
  return {
    documentationType: (resource?.documentationType as DocumentationType | null | undefined) || '',
    markdownContent: resource?.documentationMarkdown || '',
    urlContent: resource?.documentationUrl || '',
  };
}

export function documentationDraftOf(resource: Resource | undefined): DocumentationDraft {
  return { ...documentationContentOf(resource), selectedTab: 'edit', validationErrors: {} };
}
