import { lazy } from 'react';

export const CompanionSettingsPage = lazy(() => import('../settings/companion'));

export // GrapesJS is heavy — keep the visual template editor out of the main bundle
const EditEmailTemplatePage = lazy(() => import('../email-templates/edit'));

export const EmailLayoutPage = lazy(() => import('../email-layout/EmailLayoutPage'));

export // three.js + the OpenSCAD loader are large; keep them out of the main bundle.
const PrintablesPage = lazy(() => import('../printables'));
