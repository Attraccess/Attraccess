export const WAGO_DIN = '/sys/devices/platform/soc/44009000.spi/spi_master/spi0/spi0.0/din';
export const WAGO_DOCKER_PROVISION_REVIEW_FLAG = 'reviewedDockerActivation' as const;
export const WAGO_DOUT = '/sys/kernel/dout_drv/DOUT_DATA';
/** RUN LED dies used for runtime status. Cosmetic: absent files are skipped, never fatal.
 * WAGO ledserverd keeps RUN at STATIC_OFF once CODESYS is disabled, so it does not compete.
 */
export const WAGO_RUN_LEDS = {
  green: '/sys/devices/platform/led/leds/run-green/brightness',
  red: '/sys/devices/platform/led/leds/run-red/brightness',
} as const;
