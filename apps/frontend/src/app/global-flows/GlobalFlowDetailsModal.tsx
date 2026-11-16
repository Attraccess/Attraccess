import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Form,
  Input,
  Label,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  TextArea,
  TextField,
} from '@heroui/react';
import { Button, StandardModal } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  useGlobalFlowsServiceCreateGlobalFlow,
  UseGlobalFlowsServiceGetGlobalFlowKeyFn,
  useGlobalFlowsServiceListGlobalFlowsKey,
  useGlobalFlowsServiceUpdateGlobalFlow,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../components/toastProvider';
import { useGlobalFlowsTranslations } from './useGlobalFlowsTranslations';

export const GLOBAL_FLOW_NAME_MAX_LENGTH = 200;
export const GLOBAL_FLOW_DESCRIPTION_MAX_LENGTH = 2000;

type FlowDetails = { id: number; name: string; description: string | null };

/** Creates a global flow, or edits the name and description of the given one. */
export function GlobalFlowDetailsModal({
  isOpen,
  onOpenChange,
  flow,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  flow?: FlowDetails;
}) {
  const { t, tExists } = useGlobalFlowsTranslations();
  const navigate = useNavigate();
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const [name, setName] = useState(flow?.name ?? '');
  const [description, setDescription] = useState(flow?.description ?? '');

  // Every opening starts from the saved values (or empty), never from what a cancelled attempt left behind.
  useEffect(() => {
    if (isOpen) {
      setName(flow?.name ?? '');
      setDescription(flow?.description ?? '');
    }
  }, [isOpen, flow?.id, flow?.name, flow?.description]);

  const onError = (error: unknown) =>
    toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });

  const create = useGlobalFlowsServiceCreateGlobalFlow({
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: [useGlobalFlowsServiceListGlobalFlowsKey] });
      onOpenChange(false);
      navigate(`/devices/flows/${created.id}`);
    },
    onError,
  });
  const update = useGlobalFlowsServiceUpdateGlobalFlow({
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: [useGlobalFlowsServiceListGlobalFlowsKey] });
      void queryClient.invalidateQueries({ queryKey: UseGlobalFlowsServiceGetGlobalFlowKeyFn({ flowId: updated.id }) });
      onOpenChange(false);
    },
    onError,
  });

  const isPending = create.isPending || update.isPending;
  const canSubmit = name.trim().length > 0;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || isPending) return;
    const details = { name: name.trim(), description: description.trim() ? description.trim() : undefined };
    if (flow) {
      // An emptied description has to be sent as null, otherwise the old text would stay.
      update.mutate({ flowId: flow.id, requestBody: { ...details, description: details.description ?? null } });
    } else {
      create.mutate({ requestBody: details });
    }
  };

  return (
    <StandardModal isOpen={isOpen} onOpenChange={onOpenChange} data-cy="global-flows-details-modal">
      {({ close }) => (
        <Form onSubmit={submit} className="contents" data-cy="global-flows-details-form">
          <ModalHeader>
            <ModalHeading>{flow ? t('list.editModalTitle') : t('list.createdModalTitle')}</ModalHeading>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-4">
            <TextField
              value={name}
              onChange={setName}
              isRequired
              autoFocus
              fullWidth
              maxLength={GLOBAL_FLOW_NAME_MAX_LENGTH}
            >
              <Label>{t('list.createName')}</Label>
              <Input data-cy="global-flows-create-name" />
            </TextField>
            <TextField
              value={description}
              onChange={setDescription}
              fullWidth
              maxLength={GLOBAL_FLOW_DESCRIPTION_MAX_LENGTH}
            >
              <Label>{t('list.createDescription')}</Label>
              <TextArea rows={3} data-cy="global-flows-create-description" />
            </TextField>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onPress={close} isDisabled={isPending}>
              {t('list.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              isDisabled={!canSubmit}
              isPending={isPending}
              data-cy="global-flows-create-submit"
            >
              {flow ? t('list.editSubmit') : t('list.createSubmit')}
            </Button>
          </ModalFooter>
        </Form>
      )}
    </StandardModal>
  );
}
