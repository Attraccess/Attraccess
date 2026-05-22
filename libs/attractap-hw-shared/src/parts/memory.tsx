// SPI/QSPI NOR flash wrappers W25Q128JV 16 MB 133 MHz quad-SPI SOIC-8 208mil
// FEATURE: shared lib parts — Core ATT-349 ESP32-P4 external flash on FLASH_* bus

import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

export type W25q128JvProps = BasePartProps;

export const W25q128Jv = ({ name, pn, ...rest }: W25q128JvProps) => (
  <chip
    name={name}
    footprint="soic8"
    supplierPartNumbers={jlcSupplier(pn)}
    pinLabels={{
      pin1: ['CS_N'],
      pin2: ['DO'],
      pin3: ['IO2_WP'],
      pin4: ['GND'],
      pin5: ['DI'],
      pin6: ['CLK'],
      pin7: ['IO3_HOLD'],
      pin8: ['VCC'],
    }}
    {...rest}
  />
);
