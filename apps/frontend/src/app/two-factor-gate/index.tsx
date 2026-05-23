import { Button, Card } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { TwoFactorCard } from '../account/two-factor';
import { useTwoFactorGate } from '../../hooks/useTwoFactorGate';
import en from './en.json';
import de from './de.json';

interface TwoFactorGateProps {
  children: React.ReactNode;
}

export function TwoFactorGate({ children }: TwoFactorGateProps) {
  const { t } = useTranslations({ en, de });
  const gate = useTwoFactorGate();

  if (!gate.shouldShow) {
    return <div className="contents">{children}</div>;
  }

  return (
    <div className="flex w-full justify-center">
      <Card className="max-w-2xl w-full">
        <Card.Header className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold">{t('title')}</h2>
          <p className="text-sm text-default-500">
            {gate.needsTwoFactorSetup ? t('requiredDescription') : t('optionalDescription')}
          </p>
        </Card.Header>
        <Card.Content className="flex flex-col gap-6">
          <TwoFactorCard />
          {gate.canSkip && (
            <div className="flex justify-end">
              <Button variant="ghost" onPress={gate.clearSetupIntent}>
                {t('skip')}
              </Button>
            </div>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
