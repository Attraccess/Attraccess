// Footer buttons of the mass-introduction tab: start, end, restart or close
// FEATURE: ATT-1151 Mass introduction
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import type { MassIntroductionSetup } from './MassIntroductionPanel';
import { MassIntroductionSessionState } from './useMassIntroductionSession';
import en from './en.json';
import de from './de.json';

interface MassIntroductionActionsProps {
  state: MassIntroductionSessionState;
  setup: MassIntroductionSetup;
  /** Closes the drawer; a running session is ended by unmounting. */
  onClose: () => void;
}

export function MassIntroductionActions({ state, setup, onClose }: Readonly<MassIntroductionActionsProps>) {
  const { t } = useTranslations({ en, de });
  if (state.phase === 'setup') {
    return (
      <>
        <Button variant="ghost" onPress={onClose} data-cy="mass-introduction-cancel">
          {t('setup.cancel')}
        </Button>
        <Button
          variant="primary"
          onPress={() => state.start(setup.useReader && setup.readerId !== null ? setup.readerId : undefined)}
          isPending={state.isStarting}
          isDisabled={setup.useReader && setup.readerId === null}
          data-cy="mass-introduction-start"
        >
          {t('setup.start')}
        </Button>
      </>
    );
  }

  if (state.phase === 'active') {
    return (
      <Button variant="danger" onPress={state.cancel} data-cy="mass-introduction-end">
        {t('active.end')}
      </Button>
    );
  }

  return (
    <>
      <Button variant="ghost" onPress={state.reset} data-cy="mass-introduction-restart">
        {t('ended.restart')}
      </Button>
      <Button variant="primary" onPress={onClose} data-cy="mass-introduction-close">
        {t('ended.close')}
      </Button>
    </>
  );
}
