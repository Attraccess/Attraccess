import { lazy } from 'react';
export // GrapesJS is heavy — keep the visual template editor out of the main bundle
const EditEmailTemplatePage = lazy(() => import('../email-templates/edit'));
