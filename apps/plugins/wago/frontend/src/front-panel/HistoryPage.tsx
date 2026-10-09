// Keeps revision history and rollback accessible outside the live panel.
// FEATURE: WAGO controller history retains existing revision and rollback protections.
import { Button } from '@heroui/react';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ConfigurationRevisions } from '../configuration/ConfigurationRevisions';
import { readMetadata } from '../configuration/model';
import { useDraftQuery } from '../api/queries';
import { useWagoTranslations } from '../i18n';

export function HistoryPage() {
  const { controllerId } = useParams<{ controllerId: string }>();
  const { t } = useWagoTranslations();
  const id = Number(controllerId);
  if (!Number.isSafeInteger(id) || id < 1) return <p role="alert">{t('configuration.invalidController')}</p>;
  return <ControllerHistory key={id} controllerId={id} />;
}

function ControllerHistory({ controllerId }: { controllerId: number }) {
  const { t } = useWagoTranslations();
  const navigate = useNavigate();
  const draft = useDraftQuery(controllerId);
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);
  return (
    <main className="wg:mx-auto wg:flex wg:w-full wg:max-w-[1440px] wg:flex-col wg:gap-5 wg:p-4 wg:md:p-6">
      <Button
        variant="ghost"
        isDisabled={busy}
        onPress={() => navigate(`/wago/controllers/${controllerId}/configuration`)}
      >
        <ArrowLeft className="wg:size-4" />
        {t('panel.title')}
      </Button>
      <h1 className="wg:text-3xl wg:font-semibold">{t('panel.history')}</h1>
      <ConfigurationRevisions
        view="history"
        controllerId={controllerId}
        metadata={readMetadata(draft.data?.presetProvenance ?? null)}
        disabled={!draft.isSuccess}
        hasSavedDraft={Boolean(draft.data)}
        generation={generation}
        onBusyChange={setBusy}
        onRollback={async () => {
          await draft.refetch();
          setGeneration((value) => value + 1);
        }}
      />
    </main>
  );
}
