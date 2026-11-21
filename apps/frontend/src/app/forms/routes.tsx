import { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { FormEditorPage, FormsListPage } from './index';

/** Forms that apply to one resource, a resource group or every resource (ATT-796). */
export const formsRoutes: RouteConfig[] = [
  { path: '/forms', element: <FormsListPage />, authRequired: 'resources.update' },
  { path: '/forms/:formId', element: <FormEditorPage />, authRequired: 'resources.update' },
];
