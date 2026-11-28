import { Description, Label, Radio, RadioGroup } from '@heroui/react';
import { StatusAlert, useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ProjectChangeMode,
  ProjectSwitchCharging,
  ResourceUsage,
  useGetResourceBillingConfiguration,
} from '@attraccess/react-query-client';
import en from './switchProject/en.json';
import de from './switchProject/de.json';

interface ProjectChangeModeFieldProps {
  resourceId: number;
  /** The running session the dialog changes. */
  usage: ResourceUsage;
  value: ProjectChangeMode;
  onChange: (value: ProjectChangeMode) => void;
  isDisabled: boolean;
}

/** Whether the whole running session moves to the new project, or only what is used from now on. */
export function ProjectChangeModeField({
  resourceId,
  usage,
  value,
  onChange,
  isDisabled,
}: Readonly<ProjectChangeModeFieldProps>) {
  const { t } = useTranslations({ en, de });
  const isToday = new Date(usage.startTime).toDateString() === new Date().toDateString();
  const formatStart = useDateTimeFormatter({ showDate: !isToday });
  const { data: billing } = useGetResourceBillingConfiguration({ path: { resourceId } });
  const chargesNewSession = billing?.configuration.projectSwitchCharging === ProjectSwitchCharging.NEW_SESSION;

  const descriptions: Record<ProjectChangeMode, string> = {
    // The record of a continuation starts at the last split: the parts before it keep their projects.
    [ProjectChangeMode.WHOLE_SESSION]: usage.previousUsageId
      ? t('mode.descriptions.wholeSinceChange', { time: formatStart(usage.startTime) })
      : t('mode.descriptions.whole'),
    [ProjectChangeMode.SPLIT]: usage.project
      ? t('mode.descriptions.split', { project: usage.project.name })
      : t('mode.descriptions.splitUnassigned'),
  };

  return (
    <div className="flex flex-col gap-2">
      <RadioGroup
        value={value}
        onChange={(next) => onChange(next as ProjectChangeMode)}
        isDisabled={isDisabled}
        data-cy="project-change-mode"
      >
        <Label>{t('mode.label')}</Label>
        {[ProjectChangeMode.WHOLE_SESSION, ProjectChangeMode.SPLIT].map((mode) => (
          <Radio key={mode} value={mode} data-cy={`project-change-mode-${mode}`}>
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              <Label>{t(`mode.options.${mode}`)}</Label>
            </Radio.Content>
            <Description>{descriptions[mode]}</Description>
          </Radio>
        ))}
      </RadioGroup>
      {value === ProjectChangeMode.SPLIT && chargesNewSession && (
        <StatusAlert status="default" title={t('mode.newSessionFee')} />
      )}
    </div>
  );
}
