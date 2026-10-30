import { Button, Card } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAttractapServiceGetPairings } from '@attraccess/react-query-client';
import { useState } from 'react';
import { PairingDialog } from './PairingDialog';
import { WaitingDeviceSummary } from './WaitingDeviceSummary';
import de from './de.json';
import en from './en.json';

/** Readers that announced themselves without a valid pairing (revoked or cleared). */
export function WaitingToPair() {
  const { t } = useTranslations({ de, en });
  const { data: pairings } = useAttractapServiceGetPairings(undefined, { refetchInterval: 3000 });
  const [openPairing, setOpenPairing] = useState<string | null>(null);

  // Readers bound to a record were asked to pair by an admin; they are handled by the editor.
  // A pairing that was already started (for example before a page reload) can be continued here.
  const waiting = (pairings ?? []).filter((p) => p.boundReaderId === null);

  return (
    <>
      {waiting.length > 0 && (
        <Card className="p-4 flex flex-col gap-3" data-cy="attractap-waiting-to-pair">
          <div>
            <h2 className="text-lg font-semibold">{t('waiting.title')}</h2>
            <p className="text-sm text-default-500">{t('waiting.description')}</p>
          </div>
          <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
            {waiting.map((pairing) => (
              <div key={pairing.id} className="flex items-center justify-between gap-2">
                <WaitingDeviceSummary pairing={pairing} />
                <Button
                  size="sm"
                  onPress={() => setOpenPairing(pairing.id)}
                  data-cy={`attractap-waiting-pair-${pairing.id}`}
                >
                  {pairing.mode ? t('waiting.resume') : t('waiting.pair')}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
      <PairingDialog pairingId={openPairing} onClose={() => setOpenPairing(null)} />
    </>
  );
}
