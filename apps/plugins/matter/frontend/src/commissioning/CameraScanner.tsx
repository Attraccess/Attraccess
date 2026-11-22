import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useEffect, useRef, useState } from 'react';
import { useMatterTranslations } from '../i18n';
import { decodeQrFromPixels } from './qrDecode';

const SCAN_INTERVAL_MS = 250;

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

/**
 * Scans a QR code with the camera. The native `BarcodeDetector` is used where the browser has it, otherwise frames are
 * decoded in memory with jsQR. Nothing is recorded or uploaded; the stream stops when the code is found or the
 * component unmounts. A camera needs a secure context (HTTPS or localhost): without one the person is told to use an
 * image or to type the code.
 */
export function CameraScanner({ onScan }: Readonly<{ onScan: (text: string) => void }>) {
  const { t } = useMatterTranslations();
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<'insecure' | 'denied' | null>(null);
  const latest = useRef(onScan);
  latest.current = onScan;

  useEffect(() => {
    if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setProblem('insecure');
      return;
    }
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const Native = (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    const detector = Native ? new Native({ formats: ['qr_code'] }) : null;
    const canvas = document.createElement('canvas');

    const finish = (text: string) => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      latest.current(text);
    };

    const scan = async () => {
      const element = video.current;
      if (stopped || !element || element.readyState < 2 || !element.videoWidth) return;
      if (detector) {
        const found = await detector.detect(element).catch(() => []);
        if (!stopped && found[0]) finish(found[0].rawValue);
        return;
      }
      canvas.width = element.videoWidth;
      canvas.height = element.videoHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(element, 0, 0);
      const text = decodeQrFromPixels(context.getImageData(0, 0, canvas.width, canvas.height));
      if (text) finish(text);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((opened) => {
        if (stopped) {
          opened.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = opened;
        if (video.current) {
          video.current.srcObject = opened;
          void video.current.play?.().catch(() => undefined);
        }
        timer = setInterval(() => void scan(), SCAN_INTERVAL_MS);
      })
      .catch(() => !stopped && setProblem('denied'));

    return () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (problem) {
    return (
      <StatusAlert status="warning" title={t(`commissioning.camera.${problem}.title`)} data-cy="matter-camera-problem">
        {t(`commissioning.camera.${problem}.text`)}
      </StatusAlert>
    );
  }
  return (
    <video
      ref={video}
      muted
      playsInline
      aria-label={t('commissioning.camera.label')}
      className="mt:aspect-video mt:w-full mt:max-w-md mt:rounded-xl mt:bg-black"
      data-cy="matter-camera-video"
    />
  );
}
