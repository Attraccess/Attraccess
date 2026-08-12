import { useEffect, useMemo, useState } from 'react';
import { Spinner } from '@heroui/react';
import { Button } from '../../../components/button';
import { ShieldCheckIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  PasswordPolicyDto,
  UpdatePasswordPolicyDto,
  UsePasswordPolicyAdminServiceGetAdminPasswordPolicyKeyFn,
  usePasswordPolicyAdminServiceGetAdminPasswordPolicy,
  usePasswordPolicyAdminServiceUpdateAdminPasswordPolicy,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../components/pageHeader';
import { useToastMessage } from '../../../components/toastProvider';
import { PolicyFields } from './PolicyFields';
import { PreviewSection } from './PreviewSection';
import { OverridesSection } from './OverridesSection';
import { ConfirmDiffModal } from './ConfirmDiffModal';
import { POLICY_FIELD_KEYS } from './policy-fields';
import en from './en.json';
import de from './de.json';

function diff(before: PasswordPolicyDto, after: PasswordPolicyDto) {
  return POLICY_FIELD_KEYS.filter((k) => before[k] !== after[k]).map((k) => ({
    field: String(k),
    before: String(before[k]),
    after: String(after[k]),
  }));
}

function changedPayload(before: PasswordPolicyDto, after: PasswordPolicyDto): UpdatePasswordPolicyDto {
  const out: UpdatePasswordPolicyDto = {};
  POLICY_FIELD_KEYS.forEach((k) => {
    if (before[k] !== after[k]) {
      (out as Record<string, unknown>)[k as string] = after[k];
    }
  });
  return out;
}

export function PasswordPolicySettingsPage() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { data: current, isLoading } = usePasswordPolicyAdminServiceGetAdminPasswordPolicy();
  const [form, setForm] = useState<PasswordPolicyDto | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (current) setForm({ ...current });
  }, [current]);

  const { mutate, isPending } = usePasswordPolicyAdminServiceUpdateAdminPasswordPolicy({
    onSuccess: (updated) => {
      const next = updated as PasswordPolicyDto;
      setForm({ ...next });
      queryClient.invalidateQueries({ queryKey: UsePasswordPolicyAdminServiceGetAdminPasswordPolicyKeyFn() });
      setConfirmOpen(false);
      toast.success({ title: t('savedToast.title'), description: t('savedToast.description') });
    },
    onError: () => {
      toast.error({ title: t('errorToast.title'), description: t('errorToast.description') });
    },
  });

  const diffRows = useMemo(() => (current && form ? diff(current, form) : []), [current, form]);
  const isDirty = diffRows.length > 0;

  const handleConfirm = () => {
    if (!current || !form) return;
    mutate({ requestBody: changedPayload(current, form) });
  };

  if (isLoading || !form) {
    return (
      <div className="flex items-center gap-2 p-4">
        <Spinner size="sm" /> {t('loading')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<ShieldCheckIcon size={20} />} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="lg:col-span-2 flex flex-col gap-4">
          <header className="flex flex-col items-start gap-1">
            <span className="text-base font-semibold">{t('global.title')}</span>
            <span className="text-sm text-default-500">{t('global.subtitle')}</span>
          </header>
          <PolicyFields value={form} onChange={setForm} testIdPrefix="global-policy" />
          <div>
            <Button
              variant="primary"
              onPress={() => setConfirmOpen(true)}
              isDisabled={!isDirty}
              isPending={isPending}
              data-testid="policy-save-button"
            >
              {t('global.saveButton')}
            </Button>
          </div>
        </section>

        <PreviewSection policy={form} />
      </div>

      <OverridesSection globalPolicy={current ?? form} />

      <ConfirmDiffModal
        isOpen={confirmOpen}
        diff={diffRows}
        isConfirming={isPending}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

export default PasswordPolicySettingsPage;
