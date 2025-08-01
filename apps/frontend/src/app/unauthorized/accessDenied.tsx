import { memo } from 'react';
import { Button, Card, CardBody, CardFooter, CardHeader } from '@heroui/react';
import { ShieldX, ArrowLeft, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';

// Import translations
import en from './accessDenied.en.json';
import de from './accessDenied.de.json';

export const AccessDenied = memo(function AccessDeniedComponent() {
  const navigate = useNavigate();
  const { t } = useTranslations('access-denied', { en, de });

  const handleGoBack = () => {
    navigate(-1);
  };

  const handleGoHome = () => {
    navigate('/');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center justify-center">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
              <ShieldX className="w-10 h-10 text-red-600 dark:text-red-400" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
        </CardHeader>

        <CardBody>
          {/* Description */}
          <p className="text-center text-gray-600 dark:text-gray-300 leading-relaxed">{t('description')}</p>
        </CardBody>

        <CardFooter className="flex flex-col gap-2">
          {/* Action Buttons */}

          <Button
            color="primary"
            variant="solid"
            startContent={<ArrowLeft className="w-4 h-4" />}
            onPress={handleGoBack}
            fullWidth
            data-cy="access-denied-go-back-button"
          >
            {t('goBack')}
          </Button>

          <Button
            color="default"
            variant="bordered"
            startContent={<Home className="w-4 h-4" />}
            onPress={handleGoHome}
            fullWidth
            data-cy="access-denied-go-home-button"
          >
            {t('goHome')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
});

AccessDenied.displayName = 'AccessDenied';
