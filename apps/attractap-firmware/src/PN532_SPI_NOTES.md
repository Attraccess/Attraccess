# PN532 SPI Compatibility Notes

The Adafruit PN532 library uses SPI settings that differ from most other standard SPI devices. This can cause compatibility issues when sharing the SPI bus with other devices.

## Key Compatibility Issues

1. **Bit Order**: The PN532 uses `SPI_BITORDER_LSBFIRST` (LSB first), while most SPI devices use MSB first
2. **SPI Mode**: The PN532 uses `SPI_MODE0` which is common
3. **Clock Speed**: The PN532 uses a relatively slow clock speed (1MHz)

## How to Make PN532 Compatible with Other SPI Devices

When using the PN532 with other SPI devices on the same bus:

1. **Always use transactions**: The library has been updated to properly use SPI transactions

   - This ensures settings are restored between device communications

2. **For other devices on the bus**: Make sure to set their SPI settings explicitly before communicating

   ```cpp
   // Example for another SPI device on the same bus
   otherDevice.beginTransaction(SPISettings(speedHz, MSBFIRST, SPI_MODE0));
   // ... communicate with other device ...
   otherDevice.endTransaction();
   ```

3. **Timing**: Be aware that the PN532 has special timing requirements, including a 2ms CS hold during wakeup

## Recent Library Improvements

The library has been updated to:

- Use proper SPI transactions in `readdata()` and `writecommand()`
- Handle CS pin through proper abstractions in most cases
- Add detailed comments about compatibility requirements

If you continue to experience SPI bus conflicts, consider using separate SPI buses if your microcontroller supports multiple SPI interfaces.
