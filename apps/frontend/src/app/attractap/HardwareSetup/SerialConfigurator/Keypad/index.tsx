import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Alert, Button, Card, CardBody, CircularProgress, cn, Input, Progress } from '@heroui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ESPTools } from '../../../../../utils/esp-tools';
import { PageHeader } from '../../../../../components/pageHeader';

import de from './de.json';
import en from './en.json';

type KeypadType = 'MPR121' | 'NONE' | 'UNKNOWN';

interface KeypadStatusDetail {
  type: string;
  needsConfig?: boolean;
  thresholds?: [number, number];
  // channels are firmware-provided internal info; not required here
  keymap?: string[]; // index -> key label mapping from firmware
}

interface KeypadStatusResponse {
  configured: boolean;
  detail?: KeypadStatusDetail;
}

type DumpChannel = [baseline: number, filtered: number];
type DumpResponse = Record<string, DumpChannel>;

interface Props {
  className?: string;
}

export function AttractapSerialConfiguratorKeypad(props: Props) {
  const { className } = props;

  const { t } = useTranslations('attractap.hardwareSetup.serialConfigurator.keypad', {
    de,
    en,
  });

  const [keypadType, setKeypadType] = useState<KeypadType>('UNKNOWN');
  const [isDetecting, setIsDetecting] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [keymap, setKeymap] = useState<string[] | null>(null);

  const [noisePerChannel, setNoisePerChannel] = useState<number[][]>(Array.from({ length: 12 }, () => []));
  const [wiredChannels, setWiredChannels] = useState<boolean[]>(Array.from({ length: 12 }, () => false));
  const [noiseMax, setNoiseMax] = useState<number | null>(null);

  const [pressedMinGlobal, setPressedMinGlobal] = useState<number | null>(null);

  const [touchThreshold, setTouchThreshold] = useState<number | null>(null);
  const [releaseThreshold, setReleaseThreshold] = useState<number | null>(null);

  const espToolsRef = useRef<ESPTools | null>(ESPTools.getInstance());

  const clamp = useCallback((value: number, min: number, max: number) => Math.min(max, Math.max(min, value)), []);

  const getKeypadStatus = useCallback(async (): Promise<KeypadStatusResponse | null> => {
    const espTools = ESPTools.getInstance();
    const response = await espTools.sendCommand({ topic: 'keypad.status', type: 'GET' }, true, 2000);
    if (!response) {
      return null;
    }
    try {
      return JSON.parse(response) as KeypadStatusResponse;
    } catch (err) {
      console.error('Keypad-Status: Invalid JSON response', response, err);
      return null;
    }
  }, []);

  const detectKeypad = useCallback(async () => {
    setIsDetecting(true);
    const status = await getKeypadStatus();
    setIsDetecting(false);

    if (!status || !status.detail) {
      setKeypadType('NONE');
      return;
    }

    setKeypadType(status.detail.type === 'MPR121' ? 'MPR121' : 'NONE');
    if (status.detail.keymap && Array.isArray(status.detail.keymap) && status.detail.keymap.length === 12) {
      setKeymap(status.detail.keymap);
    }
  }, [getKeypadStatus]);

  const dumpOnce = useCallback(async (): Promise<DumpResponse | null> => {
    const espTools = espToolsRef.current as ESPTools;
    const response = await espTools.sendCommand({ topic: 'keypad.mpr121.dump', type: 'GET' }, true, 2000);
    if (!response) {
      return null;
    }
    try {
      const data = JSON.parse(response) as DumpResponse;
      return data;
    } catch (err) {
      console.error('Keypad-Dump: Invalid JSON response', response, err);
      return null;
    }
  }, []);

  const toDeltas = useCallback((dump: DumpResponse): number[] => {
    const deltas: number[] = Array.from({ length: 12 }, () => 0);
    for (let i = 0; i < 12; i++) {
      const channel = dump[String(i)] ?? [0, 0];
      const base = channel[0] ?? 0;
      const filtered = channel[1] ?? 0;
      deltas[i] = Math.max(0, base - filtered);
    }
    return deltas;
  }, []);

  const collectBaseline = useCallback(async () => {
    setIsBusy(true);
    setNoisePerChannel(Array.from({ length: 12 }, () => []));
    setWiredChannels(Array.from({ length: 12 }, () => false));

    const samples = 20;
    for (let s = 0; s < samples; s++) {
      const dump = await dumpOnce();
      if (!dump) {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }

      const deltas = toDeltas(dump);
      const wired: boolean[] = [];

      for (let i = 0; i < 12; i++) {
        const ch = dump[String(i)] ?? [0, 0];
        const base = ch[0] ?? 0;
        wired[i] = base > 0;
      }

      setNoisePerChannel((prev) => {
        const next = prev.map((arr) => arr.slice());
        for (let i = 0; i < 12; i++) {
          next[i].push(deltas[i]);
        }
        return next;
      });
      setWiredChannels(wired);

      await new Promise((r) => setTimeout(r, 100));
    }

    // compute noiseMax
    const noise95: number[] = [];
    for (let i = 0; i < 12; i++) {
      const arr = (prevNoiseRef.current?.[i] ?? noisePerChannel[i]).slice().sort((a, b) => a - b);
      if (arr.length === 0) {
        noise95[i] = 0;
      } else {
        const idx = Math.floor(arr.length * 0.95);
        noise95[i] = arr[Math.min(idx, arr.length - 1)];
      }
    }

    const wiredIdx: number[] = [];
    for (let i = 0; i < 12; i++) {
      if ((prevWiredRef.current?.[i] ?? wiredChannels[i]) === true) wiredIdx.push(i);
    }
    const maxNoise = wiredIdx.length ? Math.max(...wiredIdx.map((i) => noise95[i] || 0)) : Math.max(...noise95);
    setNoiseMax(maxNoise);
    setIsBusy(false);
  }, [dumpOnce, toDeltas, noisePerChannel, wiredChannels]);

  // Refs to latest noise/wired for compute step
  const prevNoiseRef = useRef<number[][] | null>(null);
  const prevWiredRef = useRef<boolean[] | null>(null);
  useEffect(() => {
    prevNoiseRef.current = noisePerChannel;
  }, [noisePerChannel]);
  useEffect(() => {
    prevWiredRef.current = wiredChannels;
  }, [wiredChannels]);

  const collectPressedQuick = useCallback(async () => {
    setIsBusy(true);
    const iterations = 12; // ~1–1.5s
    let minDelta = Number.POSITIVE_INFINITY;
    for (let i = 0; i < iterations; i++) {
      const dump = await dumpOnce();
      if (dump) {
        const deltas = toDeltas(dump);
        const current = Math.min(...deltas.filter((d) => d > 0));
        if (Number.isFinite(current)) {
          minDelta = Math.min(minDelta, current);
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!Number.isFinite(minDelta)) minDelta = 12; // fallback
    setPressedMinGlobal(minDelta);
    setIsBusy(false);
  }, [dumpOnce, toDeltas]);

  const computeThresholds = useCallback(() => {
    const nMax = noiseMax ?? 0;
    const pressedMin = pressedMinGlobal ?? Math.max(20, nMax + 6);
    const margin = 3;
    const touch = clamp(Math.floor(Math.max(nMax + margin, pressedMin * 0.25)), 8, 60);
    const release = clamp(Math.floor(touch / 2), 4, touch - 1);
    setTouchThreshold(touch);
    setReleaseThreshold(release);
  }, [clamp, noiseMax, pressedMinGlobal]);

  const applyThresholds = useCallback(async () => {
    if (touchThreshold == null || releaseThreshold == null) return;
    setIsBusy(true);
    const espTools = ESPTools.getInstance();
    const payload = `${touchThreshold} ${releaseThreshold}`;
    await espTools.sendCommand({ topic: 'keypad.mpr121.thresholds', type: 'SET', payload }, true, 3000);
    setIsBusy(false);
  }, [touchThreshold, releaseThreshold]);

  const [validateDeltas, setValidateDeltas] = useState<number[]>(Array.from({ length: 12 }, () => 0));
  const startValidation = useCallback(async () => {
    setIsBusy(true);
    const durationMs = 30 * 1000;
    const cycleDurationMs = 120;
    const loops = Math.floor(durationMs / cycleDurationMs);
    for (let i = 0; i < loops; i++) {
      const dump = await dumpOnce();
      if (dump) {
        setValidateDeltas(toDeltas(dump));
      }
      await new Promise((r) => setTimeout(r, cycleDurationMs));
    }
    setIsBusy(false);
  }, [dumpOnce, toDeltas]);

  const show = keypadType === 'MPR121';

  useEffect(() => {
    // Initial detect on mount
    detectKeypad();
  }, [detectKeypad]);

  // Must be declared before any conditional returns to keep hook order stable
  const keypadGrid = useMemo(() => {
    // Fallback index->char mapping if firmware does not provide keymap
    const fallbackIndexToChar = ['3', '6', '9', '#', '2', '5', '8', '0', '1', '4', '7', 'D'];
    const indexToChar = keymap && keymap.length === 12 ? keymap : fallbackIndexToChar;

    // Build char -> index map
    const charToIndex: Record<string, number> = {};
    indexToChar.forEach((ch, idx) => {
      if (typeof ch === 'string' && ch.length > 0) charToIndex[ch] = idx;
    });

    // Real-world layout: 3 columns x 4 rows
    const layout: string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'D', '0', '#'];

    const displayLabel = (key: string) => (key === 'D' ? t('keys.cancel') : key === '#' ? t('keys.confirm') : key);

    return (
      <div className="grid grid-cols-3 gap-2">
        {layout.map((label, pos) => {
          const idx = charToIndex[label];
          const delta = Number.isInteger(idx) ? validateDeltas[idx] ?? 0 : 0;
          const progressVal =
            touchThreshold != null ? Math.min(100, Math.round((delta / Math.max(1, touchThreshold)) * 100)) : 0;
          return (
            <Card key={`${label}-${pos}`} className="min-w-20">
              <CardBody className="p-3 flex flex-col items-center gap-1">
                <div className="text-xs text-default-500">{displayLabel(label)}</div>
                <div className="text-sm font-medium">{delta}</div>
                {touchThreshold != null && <Progress aria-label="delta" value={progressVal} />}
              </CardBody>
            </Card>
          );
        })}
      </div>
    );
  }, [keymap, validateDeltas, touchThreshold, t]);

  if (!show) {
    return (
      <div className={cn('flex flex-col gap-4', className)}>
        <PageHeader noMargin title={t('title')} />
        <Alert color="warning" title={t('unsupported.title')}>
          <div className="flex flex-col gap-2">
            <span>{t('unsupported.description')}</span>
            <Button onPress={detectKeypad} isDisabled={isDetecting} color="primary">
              {isDetecting ? t('actions.detecting') : t('actions.detect')}
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <PageHeader noMargin title={t('title')} actions={isBusy ? <CircularProgress isIndeterminate /> : undefined} />

      <Alert color="primary" title={t('baseline.title')}>
        <div className="flex flex-col gap-2">
          <div>{t('baseline.description')}</div>
          <Button onPress={collectBaseline} isDisabled={isBusy} color="primary">
            {t('baseline.start')}
          </Button>
          {noiseMax != null && <div className="text-sm">{t('baseline.noiseMax', { value: noiseMax })}</div>}
        </div>
      </Alert>

      <Alert color="default" title={t('pressed.title')}>
        <div className="flex flex-col gap-2">
          <div>{t('pressed.description')}</div>
          <Button onPress={collectPressedQuick} isDisabled={isBusy}>
            {t('pressed.quickStart')}
          </Button>
          {pressedMinGlobal != null && (
            <div className="text-sm">{t('pressed.measured', { value: pressedMinGlobal })}</div>
          )}
        </div>
      </Alert>

      <Alert color="success" title={t('compute.title')}>
        <div className="flex flex-col gap-3">
          <div className="text-sm text-default-600">{t('compute.description')}</div>
          <div className="flex gap-3 items-center">
            <Button onPress={computeThresholds} isDisabled={isBusy || noiseMax == null} color="success">
              {t('compute.computeButton')}
            </Button>
          </div>
          {touchThreshold != null && releaseThreshold != null && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="mb-1 text-sm">{t('compute.touch')}</div>
                  <Input
                    type="number"
                    step={1}
                    value={String(touchThreshold)}
                    onChange={(e) => setTouchThreshold(Number(e.target.value))}
                  />
                </div>
                <div>
                  <div className="mb-1 text-sm">{t('compute.release')}</div>
                  <Input
                    type="number"
                    step={1}
                    value={String(releaseThreshold)}
                    onChange={(e) => setReleaseThreshold(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button onPress={applyThresholds} isDisabled={isBusy} color="primary">
                  {t('apply.applyButton')}
                </Button>
                <Button onPress={startValidation} isDisabled={isBusy}>
                  {t('validate.refresh')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Alert>

      <Alert color="warning" title={t('validate.title')}>
        <div className="flex flex-col gap-3">
          <div className="text-sm text-default-600">{t('validate.description')}</div>
          {keypadGrid}
        </div>
      </Alert>
    </div>
  );
}

export default AttractapSerialConfiguratorKeypad;
