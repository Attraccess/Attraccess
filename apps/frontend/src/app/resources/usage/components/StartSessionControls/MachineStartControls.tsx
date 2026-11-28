import { ButtonGroup, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownPopover } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { ChevronDownIcon, PlayIcon } from 'lucide-react';
import { ProjectsSelect } from '../../../../../components/projectsSelect';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { NetworkRestrictedAction } from '@attraccess/application-models';
import { useNetworkRestriction } from '../../../../../hooks/useNetworkRestriction';
import { NetworkRestrictedHint } from '../../../../../components/networkRestriction/NetworkRestrictedHint';
import en from './translations/en.json';
import de from './translations/de.json';

interface MachineStartControlsProps {
  selectedProjectId?: number;
  onProjectChange: (projectId: number | undefined) => void;
  onStart: () => void;
  onStartWithNotes: () => void;
  isStarting: boolean;
  /** A start that needs a supervisor is a supervision request, which has its own network rule. */
  needsSupervisor?: boolean;
}

export function MachineStartControls({
  selectedProjectId,
  onProjectChange,
  onStart,
  onStartWithNotes,
  isStarting,
  needsSupervisor,
}: Readonly<MachineStartControlsProps>) {
  const { t } = useTranslations({ en, de });
  const { isRestricted } = useNetworkRestriction();
  const action = needsSupervisor ? NetworkRestrictedAction.SupervisionRequest : NetworkRestrictedAction.UsageStart;
  const restricted = isRestricted(action);
  return (
    <>
      <p className="text-gray-500 dark:text-gray-400">{t('machine.noActiveSession')}</p>
      <ProjectsSelect
        value={selectedProjectId}
        onChange={onProjectChange}
        label={t('machine.project.label')}
        placeholder={t('machine.project.placeholder')}
      />
      <ButtonGroup className="w-full">
        <Button isPending={isStarting} isDisabled={restricted} onPress={onStart}>
          <PlayIcon className="w-4 h-4" />
          {t('machine.startSession')}
        </Button>
        <Dropdown>
          <DropdownTrigger
            isDisabled={restricted}
            className={`${buttonVariants({ isIconOnly: true })} inline-flex items-center justify-center`}
          >
            <ChevronDownIcon />
          </DropdownTrigger>
          <DropdownPopover>
            <DropdownMenu aria-label={t('machine.alternativeStartSessionOptionsMenu.label')}>
              <DropdownItem key="startWithNotes" id="startWithNotes" onPress={onStartWithNotes}>
                {t('machine.alternativeStartSessionOptionsMenu.startWithNotes.label')}
              </DropdownItem>
            </DropdownMenu>
          </DropdownPopover>
        </Dropdown>
      </ButtonGroup>
      <NetworkRestrictedHint actions={action} />
    </>
  );
}
