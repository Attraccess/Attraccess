// Grant-introduction drawer content: introduce one person, or many at once with a QR code
// FEATURE: ATT-1151 Mass introduction
import { Key, ReactNode, useEffect, useState } from 'react';
import { DrawerBody, DrawerFooter, Tab, TabList, TabPanel, Tabs } from '@heroui/react';
import { TFunction, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useMassIntroductionSession } from './massIntroduction/useMassIntroductionSession';
import {
  INITIAL_MASS_INTRODUCTION_SETUP,
  MassIntroductionActions,
  MassIntroductionContent,
} from './massIntroduction/MassIntroductionPanel';
import { PeopleTarget } from './types';
import massEn from './massIntroduction/en.json';
import massDe from './massIntroduction/de.json';

type IntroductionTab = 'individual' | 'mass';

interface IntroductionTabsProps {
  t: TFunction;
  target: PeopleTarget;
  individualFields: ReactNode;
  individualActions: ReactNode;
  onClose: () => void;
  /** Reported so the drawer can stop a stray backdrop click from ending a running QR code. */
  onMassIntroductionRunningChange: (isRunning: boolean) => void;
}

/** Mount only while the drawer is open: unmounting ends a running mass introduction. */
export function IntroductionTabs(props: Readonly<IntroductionTabsProps>) {
  const { t, target, individualFields, individualActions, onClose, onMassIntroductionRunningChange } = props;
  const { t: tMass } = useTranslations({ en: massEn, de: massDe });
  const [tab, setTab] = useState<IntroductionTab>('individual');
  const [setup, setSetup] = useState(INITIAL_MASS_INTRODUCTION_SETUP);
  const massIntroduction = useMassIntroductionSession(target);
  const isRunning = massIntroduction.phase === 'active';

  useEffect(() => {
    onMassIntroductionRunningChange(isRunning);
  }, [isRunning, onMassIntroductionRunningChange]);

  return (
    <>
      <DrawerBody>
        <Tabs
          aria-label={t('addModal.title.introduction')}
          selectedKey={tab}
          onSelectionChange={(key: Key) => setTab(key as IntroductionTab)}
          // Switching away would hide the QR code people are about to scan.
          disabledKeys={isRunning ? ['individual'] : []}
          data-cy="introduction-tabs"
        >
          <Tabs.ListContainer>
            <TabList>
              <Tab id="individual" data-cy="introduction-tab-individual">
                <Tabs.Indicator />
                {t('addModal.tabs.individual')}
              </Tab>
              <Tab id="mass" data-cy="introduction-tab-mass">
                <Tabs.Indicator />
                {t('addModal.tabs.mass')}
              </Tab>
            </TabList>
          </Tabs.ListContainer>
          <TabPanel id="individual" className="flex flex-col gap-4 pt-4">
            {individualFields}
          </TabPanel>
          <TabPanel id="mass" className="pt-4">
            <MassIntroductionContent
              t={tMass}
              target={target}
              state={massIntroduction}
              setup={setup}
              onSetupChange={setSetup}
            />
          </TabPanel>
        </Tabs>
      </DrawerBody>
      <DrawerFooter>
        {tab === 'individual' ? (
          individualActions
        ) : (
          <MassIntroductionActions t={tMass} state={massIntroduction} setup={setup} onClose={onClose} />
        )}
      </DrawerFooter>
    </>
  );
}
