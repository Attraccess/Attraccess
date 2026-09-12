// Register paths and bit order: WAGO/cc100-howtos/HowTo_Access_Onboard_IO.
// Counts: https://www.wago.com/global/controllers/compact-controller-100/p/751-9301
// Firmware 31 still requires physical acceptance testing (ATT-984).
export const CC100_DIGITAL_PROFILE = {
  id: 'cc100-751-9301-fw31-digital-v1',
  model: '751-9301',
  firmware: '31',
  registers: {
    input: {
      hostPath: '/sys/devices/platform/soc/44009000.spi/spi_master/spi0/spi0.0/din',
      path: '/run/attraccess-wago/io/din',
      readOnly: true,
    },
    output: {
      hostPath: '/sys/kernel/dout_drv/DOUT_DATA',
      path: '/run/attraccess-wago/io/dout',
      readOnly: false,
    },
  },
  // Flat indices keep the configuration-v1 point address unambiguous.
  channels: [
    ...Array.from({ length: 4 }, (_, bit) => ({
      channel: bit,
      name: `DO${bit + 1}`,
      direction: 'output' as const,
      bit,
    })),
    ...Array.from({ length: 8 }, (_, bit) => ({
      channel: bit + 4,
      name: `DI${bit + 1}`,
      direction: 'input' as const,
      bit,
    })),
  ],
} as const;
