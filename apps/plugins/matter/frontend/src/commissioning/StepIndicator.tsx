import { useMatterTranslations } from '../i18n';

export const FLOW_STEPS = ['prepare', 'code', 'progress', 'finish'] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];

/** The four steps of the flow with the current one marked. */
export function StepIndicator({ current }: Readonly<{ current: FlowStep }>) {
  const { t } = useMatterTranslations();
  const index = FLOW_STEPS.indexOf(current);
  return (
    <ol className="mt:flex mt:flex-wrap mt:gap-x-6 mt:gap-y-1 mt:text-sm" data-cy="matter-flow-steps">
      {FLOW_STEPS.map((step, position) => (
        <li
          key={step}
          aria-current={step === current ? 'step' : undefined}
          className={step === current ? 'mt:font-semibold' : position < index ? '' : 'mt:text-muted'}
          data-cy={`matter-flow-step-${step}`}
        >
          {position + 1}. {t(`commissioning.flow.${step}`)}
        </li>
      ))}
    </ol>
  );
}
