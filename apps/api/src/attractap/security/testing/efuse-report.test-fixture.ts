import type { EfuseReport } from '../efuse-report';

export const DIGEST0 = 'fd0e62812a67e20c36a85321733343e8ebd420e2d7940bbfd49ac9e1c502b29d';
export const DIGEST1 = '65c97f279aa20b82d134fd6cc0eeb39d51e42a50d9c3d771f25b42e6487fafd9';
const key = (purpose: string, readProtected = false) => ({ purpose, used: purpose !== 'USER', readProtected });

/** A report as a release secure reader sends it. */
export function releaseReport(overrides: Partial<EfuseReport> = {}): EfuseReport {
  return {
    mac: 'dc:b4:d9:21:71:c8',
    secureBootEn: true,
    keys: [
      key('SECURE_BOOT_DIGEST0'),
      key('SECURE_BOOT_DIGEST1'),
      key('XTS_AES_128_KEY', true),
      key('USER'),
      key('HMAC_UP', true),
      key('USER'),
    ],
    digest0: DIGEST0,
    digest1: DIGEST1,
    revoke: [false, false, true],
    cryptCnt: 7,
    cryptCntWriteProtected: true,
    disDownloadManualEncrypt: true,
    jtag: { padDisabled: true, usbDisabled: true, softDisJtag: 0 },
    download: {
      disDownloadMode: false,
      enableSecurityDownload: true,
      disForceDownload: false,
      disUsbSerialJtagDownload: true,
    },
    rdDis: 0b0010100,
    rdDisWriteProtected: true,
    secureVersion: 1,
    flashEncryptionMode: 'release',
    ...overrides,
  };
}
