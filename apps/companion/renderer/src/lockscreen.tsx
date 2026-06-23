import { createRoot } from 'react-dom/client';
import './styles.css';
import { Providers } from '@attraccess/ui';
import { LockScreenApp } from './LockScreenApp';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

createRoot(rootEl).render(
  <Providers defaultTheme="dark">
    <LockScreenApp />
  </Providers>
);
