import { lazy } from 'react';
export // three.js + the OpenSCAD loader are large; keep them out of the main bundle.
const PrintablesPage = lazy(() => import('../printables'));
