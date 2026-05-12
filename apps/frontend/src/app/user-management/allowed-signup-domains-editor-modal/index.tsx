import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  useUsersServiceGetLocalSignupDomainWhitelist,
  useUsersServiceSetLocalSignupDomainWhitelist,
} from '@attraccess/react-query-client';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Button,
  InputGroup,
  Label,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TextField,
  useOverlayState,
} from '@heroui/react';
import { EmptyState } from '../../../components/emptyState';
import { PageHeader } from '../../../components/pageHeader';
import { PlusIcon, Settings2Icon, Trash2Icon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import en from './en.json';
import de from './de.json';
import { useToastMessage } from '../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
}

export function AllowedSignupDomainsEditorModal(props: Props) {
  const { isOpen, open, setOpen, close: closeModal } = useOverlayState();
  const { t, tExists } = useTranslations({
    de: {
      ...de,
      api: API_ERROR_TRANSLATIONS_DE,
    },
    en: {
      ...en,
      api: API_ERROR_TRANSLATIONS_EN,
    },
  });

  const { data: allowedSignupDomains } = useUsersServiceGetLocalSignupDomainWhitelist();

  const [domainToAdd, setDomainToAdd] = useState<string>('');
  const [editedDomains, setEditedDomains] = useState<string[]>(allowedSignupDomains ?? []);
  useEffect(() => {
    setEditedDomains(allowedSignupDomains ?? []);
  }, [allowedSignupDomains]);

  const addDomainInputRef = useRef<HTMLInputElement>(null);

  const onAddDomain = useCallback(() => {
    const input = addDomainInputRef.current;

    if (!input) {
      return;
    }

    const isValid = input.checkValidity();
    if (!isValid) {
      return;
    }

    const value = domainToAdd.trim().toLowerCase();

    if (value === '') {
      return;
    }

    setEditedDomains([...editedDomains, value]);
    setDomainToAdd('');
  }, [editedDomains, domainToAdd, setEditedDomains, setDomainToAdd]);

  const onRemoveDomain = useCallback(
    (domain: string) => {
      setEditedDomains(editedDomains.filter((d) => d !== domain));
    },
    [editedDomains, setEditedDomains],
  );

  const toast = useToastMessage();

  const { mutate: saveAllowedSignupDomains, isPending: isSaving } = useUsersServiceSetLocalSignupDomainWhitelist({
    onSuccess: () => {
      toast.success({
        title: t('actions.save.success.title'),
        description: t('actions.save.success.description'),
      });
      closeModal();
    },
    onError: (error) => {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
  });

  const onSave = useCallback(() => {
    saveAllowedSignupDomains({ requestBody: editedDomains });
  }, [editedDomains, saveAllowedSignupDomains]);

  return (
    <>
      {props.children(open)}
      <Modal isOpen={isOpen} onOpenChange={setOpen}>
        <ModalBackdrop>
          <ModalContainer>
            <ModalDialog>
              {() => (
                <>
                  <ModalHeader>
                    <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<Settings2Icon />} noMargin={true} />
                  </ModalHeader>

                  <ModalBody>
                    <Alert status="warning" className="whitespace-pre-wrap">
                      <AlertContent>
                        <AlertDescription>{t('noteAboutNoneAndWildcard')}</AlertDescription>
                      </AlertContent>
                    </Alert>
                    <TextField value={domainToAdd} onChange={setDomainToAdd}>
                      <Label>{t('inputs.addDomain.label')}</Label>
                      <InputGroup>
                        <InputGroup.Input
                          ref={addDomainInputRef}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              onAddDomain();
                            }
                          }}
                        />
                        <InputGroup.Suffix>
                          <Button variant="ghost" onPress={onAddDomain} isIconOnly ><PlusIcon /></Button>
                        </InputGroup.Suffix>
                      </InputGroup>
                    </TextField>

                    <Table>
                      <TableContent aria-label={t('table.ariaLabel')}>
                      <TableHeader>
                        <TableColumn>{t('table.columns.domain')}</TableColumn>
                        <TableColumn>{t('table.columns.actions')}</TableColumn>
                      </TableHeader>
                      <TableBody
                        items={(editedDomains ?? []).map((domain) => ({ value: domain }))}
                        renderEmptyState={() => <EmptyState />}
                      >
                        {(domain) => (
                          <TableRow key={domain.value} id={domain.value}>
                            <TableCell className="w-full">{domain.value}</TableCell>
                            <TableCell className="flex-row flex">
                              <Button variant="danger-soft" onPress={() => onRemoveDomain(domain.value)}>
                                <Trash2Icon className="w-4 h-4" />
                                {t('table.actions.removeDomain')}
                              </Button>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                      </TableContent>
                    </Table>
                  </ModalBody>

                  <ModalFooter>
                    <Button variant="primary" onPress={onSave} isPending={isSaving}>
                      {t('actions.save.label')}
                    </Button>
                  </ModalFooter>
                </>
              )}
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </>
  );
}
