import {
  Accordion,
  AccordionBody,
  AccordionHeading,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
  Card,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

const SETUP_STEPS = ['download', 'run', 'url', 'register', 'name', 'flow'] as const;

export function CompanionSetupCard() {
  const { t } = useTranslations({ en, de });
  return (
    <Card>
      <Card.Header className="flex flex-col items-start gap-1">
        <span className="text-base font-semibold">{t('setup.title')}</span>
        <span className="text-sm text-default-500">{t('setup.subtitle')}</span>
      </Card.Header>
      <Card.Content>
        <Accordion>
          {SETUP_STEPS.map((step, idx) => (
            <AccordionItem key={step} id={step} aria-label={t(`setup.steps.${step}.title`)}>
              <AccordionHeading>
                <AccordionTrigger>
                  <span className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                      {idx + 1}
                    </span>
                    {t(`setup.steps.${step}.title`)}
                  </span>
                </AccordionTrigger>
              </AccordionHeading>
              <AccordionPanel>
                <AccordionBody>
                  <p className="text-sm text-default-600 ml-9">{t(`setup.steps.${step}.description`)}</p>
                </AccordionBody>
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      </Card.Content>
    </Card>
  );
}
