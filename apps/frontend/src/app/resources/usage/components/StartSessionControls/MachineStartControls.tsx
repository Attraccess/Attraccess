import { ButtonGroup, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownPopover } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { ChevronDownIcon, PlayIcon } from 'lucide-react';
import { ProjectsSelect } from '../../../../../components/projectsSelect';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './translations/en.json';
import de from './translations/de.json';

interface MachineStartControlsProps {
  selectedProjectId?: number;
  onProjectChange: (projectId: number | undefined) => void;
  onStart: () => void;
  onStartWithNotes: () => void;
  isStarting: boolean;
}

export function MachineStartControls({
  selectedProjectId,
  onProjectChange,
  onStart,
  onStartWithNotes,
  isStarting,
}: Readonly<MachineStartControlsProps>) {
  const { t } = useTranslations({ en, de });
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
        <Button isPending={isStarting} onPress={onStart}>
          <PlayIcon className="w-4 h-4" />
          {t('machine.startSession')}
        </Button>
        <Dropdown>
          <DropdownTrigger
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
    </>
  );
}
