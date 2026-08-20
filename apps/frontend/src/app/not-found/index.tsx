import { memo } from 'react';
import { Button, Card } from '@heroui/react';
import { ArrowLeft, Home, MapPinOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';

import en from './en.json';
import de from './de.json';

// Rendered by the catch-all route *inside* the app shell, so the sidebar stays reachable and an
// operator on a stale bookmark can navigate out instead of staring at a blank document (ATT-869).
export const NotFound = memo(function NotFoundComponent() {
  const navigate = useNavigate();
  const { t } = useTranslations({ en, de });

  return (
    <div className="flex flex-col items-center justify-center py-16" data-cy="not-found">
      <Card className="w-full max-w-md">
        <Card.Header className="flex flex-col items-center justify-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-surface-secondary">
            <MapPinOff className="h-10 w-10 text-muted" />
          </div>

          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        </Card.Header>

        <Card.Content>
          <p className="text-center leading-relaxed text-muted">{t('description')}</p>
        </Card.Content>

        <Card.Footer className="flex flex-col gap-2">
          <Button variant="primary" onPress={() => navigate(-1)} className="w-full" data-cy="not-found-go-back-button">
            <ArrowLeft className="h-4 w-4" />
            {t('goBack')}
          </Button>

          <Button variant="outline" onPress={() => navigate('/')} className="w-full" data-cy="not-found-go-home-button">
            <Home className="h-4 w-4" />
            {t('goHome')}
          </Button>
        </Card.Footer>
      </Card>
    </div>
  );
});

NotFound.displayName = 'NotFound';
