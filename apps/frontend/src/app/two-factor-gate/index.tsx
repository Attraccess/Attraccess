import { Button, Card, CardBody, CardHeader } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { TwoFactorCard } from '../account/two-factor';
import type { TwoFactorGateState } from '../../hooks/useTwoFactorGate';
import en from './en.json';
import de from './de.json';

interface TwoFactorGateProps {
  gate: TwoFactorGateState;
}

export function TwoFactorGate({ gate }: TwoFactorGateProps) {
  const { t } = useTranslations({ en, de });

  return (
    <div className="flex w-full justify-center">
      <Card className="max-w-2xl w-full">
        <CardHeader className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold">{t('title')}</h2>
          <p className="text-sm text-default-500">
            {gate.needsTwoFactorSetup ? t('requiredDescription') : t('optionalDescription')}
          </p>
        </CardHeader>
        <CardBody className="flex flex-col gap-6">
          <TwoFactorCard />
          {gate.canSkip && (
            <div className="flex justify-end">
              <Button variant="light" onPress={gate.clearSetupIntent}>
                {t('skip')}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
