import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Providers } from '@attraccess/ui';
import { WizardApp } from './WizardApp';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

createRoot(rootEl).render(
  <StrictMode>
    <Providers defaultTheme="light">
      <WizardApp />
    </Providers>
  </StrictMode>
);
