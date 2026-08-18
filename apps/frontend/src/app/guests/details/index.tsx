import { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Chip,
  Input,
  Label,
  TextField,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Skeleton,
} from '@heroui/react';
import { KeyIcon, QrCodeIcon, ShieldIcon, TicketIcon, TrashIcon, UserIcon } from 'lucide-react';
import { QRCode } from 'react-qrcode-logo';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  GuestDto,
  UseGuestsServiceGetGuestByIdKeyFn,
  UseGuestsServiceGetGuestEnrollmentKeyFn,
  useGuestsServiceDeleteGuest,
  useGuestsServiceFindManyGuestsKey,
  useGuestsServiceGetGuestById,
  useGuestsServiceGetGuestEnrollment,
  useGuestsServiceRevokeGuestEnrollment,
  useGuestsServiceRotateGuestEnrollment,
  useGuestsServiceUpdateGuest,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../../components/pageHeader';
import { FlatSection } from '../../../components/flatSection';
import { Button } from '../../../components/button';
import { LabeledSwitch } from '../../../components/labeledSwitch';
import { StandardModal } from '../../../components/standardModal';
import { useToastMessage } from '../../../components/toastProvider';
import { NotFound } from '../../not-found';
import { GuestAccessManagement } from './components/access-management';

import en from './en.json';
import de from './de.json';

export function GuestManagementDetailsPage() {
  const { id } = useParams();
  const guestId = Number(id);

  const { data: guest, isLoading } = useGuestsServiceGetGuestById({ id: guestId });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="w-full h-12" />
        <Skeleton className="w-full h-40" />
      </div>
    );
  }

  if (!guest || Number.isNaN(guestId)) {
    return <NotFound />;
  }

  return <GuestDetails guest={guest} />;
}

function GuestDetails({ guest }: { guest: GuestDto }) {
  const { t, tExists } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const invalidateGuest = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: UseGuestsServiceGetGuestByIdKeyFn({ id: guest.id }) });
    queryClient.invalidateQueries({ queryKey: [useGuestsServiceFindManyGuestsKey] });
  }, [guest.id, queryClient]);

  const invalidateEnrollment = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: UseGuestsServiceGetGuestEnrollmentKeyFn({ id: guest.id }) });
  }, [guest.id, queryClient]);

  // ── Profile ────────────────────────────────────────────────────────────────
  const [name, setName] = useState(guest.name);
  const [email, setEmail] = useState(guest.email ?? '');
  const { mutate: updateGuest, isPending: isUpdatingProfile } = useGuestsServiceUpdateGuest({
    onSuccess: () => {
      toast.success({
        title: t('sections.profile.success.title'),
        description: t('sections.profile.success.description'),
      });
      invalidateGuest();
    },
    onError: (error) => toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' }),
  });

  const onSaveProfile = useCallback(() => {
    updateGuest({
      id: guest.id,
      requestBody: {
        name: name.trim(),
        email: email.trim() ? email.trim() : null,
      },
    });
  }, [email, guest.id, name, updateGuest]);

  // ── Status ─────────────────────────────────────────────────────────────────
  const { mutate: toggleEnabled, isPending: isToggling } = useGuestsServiceUpdateGuest({
    onSuccess: (data) => {
      toast.success({
        title: data.guestEnabled
          ? t('sections.status.success.enabled')
          : t('sections.status.success.disabled'),
      });
      invalidateGuest();
    },
    onError: (error) => toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' }),
  });

  // ── Enrollment ─────────────────────────────────────────────────────────────
  const { data: enrollment } = useGuestsServiceGetGuestEnrollment(
    { id: guest.id },
    undefined,
    { enabled: guest.hasCredential },
  );
  const { mutate: rotateCredential, isPending: isRotating } = useGuestsServiceRotateGuestEnrollment({
    onSuccess: () => {
      toast.success({ title: t('sections.enrollment.success.rotated') });
      invalidateGuest();
      invalidateEnrollment();
    },
    onError: (error) => toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' }),
  });

  const [revokeOpen, setRevokeOpen] = useState(false);
  const { mutate: revokeCredential, isPending: isRevoking } = useGuestsServiceRevokeGuestEnrollment({
    onSuccess: () => {
      toast.success({ title: t('sections.enrollment.success.revoked') });
      setRevokeOpen(false);
      invalidateGuest();
      invalidateEnrollment();
    },
    onError: (error) => toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' }),
  });

  // ── Delete ─────────────────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { mutate: deleteGuest, isPending: isDeleting } = useGuestsServiceDeleteGuest({
    onSuccess: () => {
      toast.success({
        title: t('sections.delete.success.title'),
        description: t('sections.delete.success.description'),
      });
      queryClient.invalidateQueries({ queryKey: [useGuestsServiceFindManyGuestsKey] });
      navigate('/guests');
    },
    onError: (error) => toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' }),
  });

  return (
    <div data-cy="guest-details-page">
      <PageHeader
        title={guest.name}
        subtitle={t('title')}
        backTo="/guests"
        icon={<TicketIcon className="w-6 h-6" />}
        actions={[]}
      />

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FlatSection icon={<UserIcon className="w-4 h-4" />} title={t('sections.profile.title')}>
          <div className="flex flex-col gap-4">
            <TextField value={name} onChange={setName}>
              <Label>{t('sections.profile.name.label')}</Label>
              <Input data-cy="guest-profile-name-input" />
            </TextField>
            <TextField value={email} onChange={setEmail}>
              <Label>{t('sections.profile.email.label')}</Label>
              <Input type="email" data-cy="guest-profile-email-input" />
            </TextField>
            <div>
              <Button
                onPress={onSaveProfile}
                isPending={isUpdatingProfile}
                isDisabled={!name.trim()}
                data-cy="guest-profile-save-button"
              >
                {t('sections.profile.save')}
              </Button>
            </div>
          </div>
        </FlatSection>

        <FlatSection icon={<ShieldIcon className="w-4 h-4" />} title={t('sections.status.title')}>
          <div className="flex flex-col gap-3">
            <LabeledSwitch
              isSelected={guest.guestEnabled}
              onChange={(selected) => toggleEnabled({ id: guest.id, requestBody: { guestEnabled: selected } })}
              isDisabled={isToggling}
              data-cy="guest-enabled-switch"
            >
              <span className="text-sm font-medium">{t('sections.status.enabledLabel')}</span>
            </LabeledSwitch>
            <p className="text-sm text-default-500">{t('sections.status.enabledDescription')}</p>
          </div>
        </FlatSection>

        <FlatSection icon={<QrCodeIcon className="w-4 h-4" />} title={t('sections.enrollment.title')}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-default-500">{t('sections.enrollment.description')}</p>

            {guest.hasCredential && enrollment ? (
              <>
                <div className="flex flex-col items-center gap-2">
                  <QRCode value={enrollment.otpauthUrl} size={180} />
                  <div className="text-xs text-default-500 text-center">{t('sections.enrollment.qrHint')}</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TextField value={enrollment.guestCode} isReadOnly>
                    <Label>{t('sections.enrollment.guestCode')}</Label>
                    <Input data-cy="guest-enrollment-code" />
                  </TextField>
                  <TextField value={enrollment.secret} isReadOnly>
                    <Label>{t('sections.enrollment.secret')}</Label>
                    <Input data-cy="guest-enrollment-secret" />
                  </TextField>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onPress={() => rotateCredential({ id: guest.id })}
                    isPending={isRotating}
                    data-cy="guest-enrollment-rotate-button"
                  >
                    {t('sections.enrollment.rotate')}
                  </Button>
                  <Button variant="danger" onPress={() => setRevokeOpen(true)} data-cy="guest-enrollment-revoke-button">
                    {t('sections.enrollment.revoke')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm">{t('sections.enrollment.noCredential')}</p>
                <div>
                  <Button
                    onPress={() => rotateCredential({ id: guest.id })}
                    isPending={isRotating}
                    data-cy="guest-enrollment-provision-button"
                  >
                    {t('sections.enrollment.provision')}
                  </Button>
                </div>
              </>
            )}
          </div>
        </FlatSection>

        <FlatSection icon={<KeyIcon className="w-4 h-4" />} title={t('sections.access.title')}>
          <GuestAccessManagement guestId={guest.id} t={t} />
        </FlatSection>

        <FlatSection icon={<TrashIcon className="w-4 h-4" />} title={t('sections.delete.title')} className="lg:col-span-2">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-default-500">{t('sections.delete.description')}</p>
            <div>
              <Button variant="danger" onPress={() => setDeleteOpen(true)} data-cy="guest-delete-button">
                {t('sections.delete.button')}
              </Button>
            </div>
          </div>
        </FlatSection>
      </div>

      {/* Revoke credential confirmation */}
      <StandardModal isOpen={revokeOpen} onOpenChange={(o) => setRevokeOpen(o)} size="md">
        <ModalHeader>
          <h2 className="text-lg font-semibold">{t('sections.enrollment.confirmRevoke.title')}</h2>
        </ModalHeader>
        <ModalBody>
          <p className="text-sm text-default-500">{t('sections.enrollment.confirmRevoke.description')}</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onPress={() => setRevokeOpen(false)}>
            {t('sections.access.add.cancel')}
          </Button>
          <Button
            variant="danger"
            onPress={() => revokeCredential({ id: guest.id })}
            isPending={isRevoking}
          >
            {t('sections.enrollment.confirmRevoke.confirm')}
          </Button>
        </ModalFooter>
      </StandardModal>

      {/* Delete confirmation */}
      <StandardModal isOpen={deleteOpen} onOpenChange={(o) => setDeleteOpen(o)} size="md">
        <ModalHeader>
          <h2 className="text-lg font-semibold">{t('sections.delete.confirmTitle')}</h2>
        </ModalHeader>
        <ModalBody>
          <p className="text-sm text-default-500">{t('sections.delete.confirmDescription')}</p>
          <div className="flex items-center gap-2">
            <Chip size="sm" color="danger" variant="soft">
              {guest.name}
            </Chip>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onPress={() => setDeleteOpen(false)}>
            {t('sections.access.add.cancel')}
          </Button>
          <Button variant="danger" onPress={() => deleteGuest({ id: guest.id })} isPending={isDeleting}>
            {t('sections.delete.confirm')}
          </Button>
        </ModalFooter>
      </StandardModal>
    </div>
  );
}
