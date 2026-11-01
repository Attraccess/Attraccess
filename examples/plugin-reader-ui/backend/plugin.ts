// Reader UI example plugin: one slot widget and one confirm step, no reader-specific code.
//
// The plugin only describes data. The host validates it, transliterates it to Latin-1, checks the
// limits and renders it on every reader that can show it. Readers without a screen fall back to the
// host's no-screen policy for the confirm step.
import type {
  PluginBackendModule,
  PreStartContext,
  PreStartResult,
  ReaderSlotContribution,
  ReaderUiContext,
  ReaderUiProvider,
} from '@attraccess/plugins-backend-sdk';
import { Module, type DynamicModule } from '@nestjs/common';

const CONFIRM_STEP_KEY = 'tidy-up';

const TEXT = {
  en: { badge: 'Tidy up after use', title: 'Before you start', body: 'Is the machine clean and ready?' },
  de: { badge: 'Bitte aufraeumen', title: 'Bevor du startest', body: 'Ist die Maschine sauber und bereit?' },
} as const;

const readerUi: ReaderUiProvider = {
  getSlotContributions(ctx: ReaderUiContext): ReaderSlotContribution[] {
    const text = TEXT[ctx.language] ?? TEXT.en;
    return [
      {
        slotId: 'resourceList.row.status',
        key: 'tidy-hint',
        tree: { t: 'badge', text: text.badge, tone: 'primary' },
        fallback: { text: text.badge },
      },
    ];
  },
};

function preStartHook(ctx: PreStartContext): PreStartResult {
  if (ctx.confirmedStepKeys.includes(CONFIRM_STEP_KEY)) return { decision: 'allow' };
  // The host passes the card user's language on readers and the user's preferred language elsewhere.
  const text = TEXT[ctx.language] ?? TEXT.en;
  return {
    decision: 'confirm',
    confirmation: {
      stepKey: CONFIRM_STEP_KEY,
      title: text.title,
      body: text.body,
      tone: 'primary',
      expiresInSec: 60,
      noScreenPolicy: 'block',
    },
  };
}

@Module({})
class ReaderUiExampleModule {}

const plugin: PluginBackendModule = {
  register: (): DynamicModule => ({ module: ReaderUiExampleModule }),
  readerUi,
  preStartHook,
};

export default plugin;
