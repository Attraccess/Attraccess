import { createMetricsAdapter } from './index';
import { WindowsMetricsAdapter } from './adapters/windows';
import { MacosMetricsAdapter } from './adapters/macos';
import { LinuxMetricsAdapter } from './adapters/linux';

describe('createMetricsAdapter', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  function setPlatform(platform: string) {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  }

  it('returns WindowsMetricsAdapter on win32', () => {
    setPlatform('win32');
    expect(createMetricsAdapter()).toBeInstanceOf(WindowsMetricsAdapter);
  });

  it('returns MacosMetricsAdapter on darwin', () => {
    setPlatform('darwin');
    expect(createMetricsAdapter()).toBeInstanceOf(MacosMetricsAdapter);
  });

  it('returns LinuxMetricsAdapter on linux', () => {
    setPlatform('linux');
    expect(createMetricsAdapter()).toBeInstanceOf(LinuxMetricsAdapter);
  });

  it('returns LinuxMetricsAdapter for unknown platforms', () => {
    setPlatform('freebsd');
    expect(createMetricsAdapter()).toBeInstanceOf(LinuxMetricsAdapter);
  });
});
