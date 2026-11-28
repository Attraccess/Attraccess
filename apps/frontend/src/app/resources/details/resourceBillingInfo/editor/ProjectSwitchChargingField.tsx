import { Description, Label, Radio, RadioGroup } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ProjectSwitchCharging } from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';

interface ProjectSwitchChargingFieldProps {
  value: ProjectSwitchCharging;
  onChange: (value: ProjectSwitchCharging) => void;
}

/** How the resource charges a running session whose owner switches its project. */
export function ProjectSwitchChargingField({ value, onChange }: Readonly<ProjectSwitchChargingFieldProps>) {
  const { t } = useTranslations({ en, de });
  return (
    <RadioGroup
      value={value}
      onChange={(next) => onChange(next as ProjectSwitchCharging)}
      data-cy="project-switch-charging"
    >
      <Label>{t('inputs.projectSwitchCharging.label')}</Label>
      <Description>{t('inputs.projectSwitchCharging.description')}</Description>
      {Object.values(ProjectSwitchCharging).map((option) => (
        <Radio key={option} value={option} data-cy={`project-switch-charging-${option}`}>
          <Radio.Content>
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            <Label>{t(`inputs.projectSwitchCharging.options.${option}`)}</Label>
          </Radio.Content>
          <Description>{t(`inputs.projectSwitchCharging.descriptions.${option}`)}</Description>
        </Radio>
      ))}
    </RadioGroup>
  );
}
