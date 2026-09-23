import { useEffect, useRef, useState } from 'react';
import {
  Button,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  FieldError,
  Input,
  Label,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ResourceType,
  useResourcesServiceCreateOneResource,
  useResourcesServiceGetAllResourcesKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { DoorOpen, Shapes } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { recordUsefulAction } from '../../components/DonationPrompt/usefulAction';
import { SplitActionButton } from '../../components/splitActionButton';
import { StandardDrawer } from '../../components/standardDrawer';
import { useToastMessage } from '../../components/toastProvider';
import en from './createResourceDrawer.en.json';
import de from './createResourceDrawer.de.json';

type AfterCreate = 'open' | 'another';

export function CreateResourceDrawer({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToastMessage();
  const [name, setName] = useState('');
  const [type, setType] = useState<ResourceType>(ResourceType.MACHINE);
  const [showNameError, setShowNameError] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const afterCreate = useRef<AfterCreate>('open');

  const clearForm = () => {
    setName('');
    setType(ResourceType.MACHINE);
    setShowNameError(false);
    setFormKey((key) => key + 1);
  };

  useEffect(() => {
    if (isOpen) clearForm();
  }, [isOpen]);

  const createResource = useResourcesServiceCreateOneResource({
    onSuccess: (resource) => {
      recordUsefulAction();
      toast.success({
        title: t('successTitle'),
        description: t('successDescription', { name: resource.name }),
      });
      void queryClient.invalidateQueries({ queryKey: [useResourcesServiceGetAllResourcesKey] });

      if (afterCreate.current === 'another') {
        clearForm();
        return;
      }

      onOpenChange(false);
      navigate(`/resources/${resource.id}`);
    },
    onError: (error) => {
      toast.error({
        title: t('errorTitle'),
        description: t('errorDescription', { message: (error as Error).message }),
      });
    },
  });

  const submit = (action: AfterCreate) => {
    if (createResource.isPending) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setShowNameError(true);
      return;
    }

    afterCreate.current = action;
    createResource.mutate({ formData: { name: trimmedName, type } });
  };

  return (
    <StandardDrawer
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!createResource.isPending) onOpenChange(open);
      }}
    >
      <DrawerHeader>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
      </DrawerHeader>
      <DrawerBody className="flex flex-col gap-6">
        <TextField
          key={formKey}
          value={name}
          onChange={(value) => {
            setName(value);
            if (value.trim()) setShowNameError(false);
          }}
          isRequired
          isInvalid={showNameError}
          className="w-full"
          data-cy="resource-create-name-input"
        >
          <Label>{t('name')}</Label>
          <Input
            autoFocus
            placeholder={t('namePlaceholder')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit('open');
              }
            }}
          />
          {showNameError && <FieldError>{t('nameRequired')}</FieldError>}
        </TextField>
        <div>
          <p className="mb-2 text-sm font-medium">{t('type')}</p>
          <ToggleButtonGroup
            aria-label={t('type')}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[type]}
            onSelectionChange={(keys) => setType(keys.has(ResourceType.DOOR) ? ResourceType.DOOR : ResourceType.MACHINE)}
            isDisabled={createResource.isPending}
            fullWidth
            isDetached
          >
            {([ResourceType.MACHINE, ResourceType.DOOR] as const).map((option) => {
              const Icon = option === ResourceType.MACHINE ? Shapes : DoorOpen;
              return (
                <ToggleButton
                  key={option}
                  id={option}
                >
                  <Icon size={20} />
                  {t(option === ResourceType.MACHINE ? 'machine' : 'door')}
                </ToggleButton>
              );
            })}
          </ToggleButtonGroup>
        </div>
        <p className="text-sm text-muted">{t('later')}</p>
      </DrawerBody>
      <DrawerFooter className="flex flex-col gap-2 min-[380px]:flex-row">
        <Button variant="outline" onPress={() => onOpenChange(false)} isDisabled={createResource.isPending}>
          {t('cancel')}
        </Button>
        <SplitActionButton
          label={t('createAndOpen')}
          menuLabel={t('createOptions')}
          onPress={() => submit('open')}
          options={[{ id: 'another', label: t('createAnother'), onPress: () => submit('another') }]}
          isPending={createResource.isPending}
          dataCy="resource-create-submit-button"
        />
      </DrawerFooter>
    </StandardDrawer>
  );
}
