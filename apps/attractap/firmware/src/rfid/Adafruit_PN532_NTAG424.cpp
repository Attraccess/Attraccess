// Adafruit PN532 driver, BSD license. See pn532_driver_history.hpp.
#include "pn532/internal.hpp"

#include "pn532/history.hpp"

Pn532DebugPort Pn532Driver::serial;
byte pn532ack[] = {0x00, 0x00, 0xFF, 0x00, 0xFF, 0x00};
byte pn532response_firmwarevers[] = {0x00, 0x00, 0xFF, 0x06, 0xFA, 0xD5};
byte pn532_packetbuffer[PN532_PACKBUFFSIZ];
/*!
    @brief  Instantiates a new PN532 class using I2C on the shared bus.

    @param  i2cAddress  7-bit I2C address (default PN532_I2C_ADDRESS; V4
                        hardware shifts it to 0x64 via the DFR1185 shifter)

    @note   The IRQ line is not wired on any Attractap board (readiness is
            polled via the I2C status byte) and RSTPD_N is not connected, so
            neither pin exists anymore.
*/
/**************************************************************************/
Adafruit_PN532::Adafruit_PN532(uint8_t i2cAddress)
{
  i2c_dev = new Pn532I2cDevice(i2cAddress);
}
