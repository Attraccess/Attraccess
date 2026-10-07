// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/**************************************************************************/
/*!
    @brief  Sends a command and waits a specified period for the ACK

    @param  cmd       Pointer to the command buffer
    @param  cmdlen    The size of the command in bytes
    @param  timeout   timeout before giving up

    @returns  1 if everything is OK, 0 if timeout occured before an
              ACK was recieved
*/
/**************************************************************************/
// default timeout of one second
bool Adafruit_PN532::sendCommandCheckAck(uint8_t *cmd, uint8_t cmdlen,
                                         uint16_t timeout)
{

  // I2C works without using IRQ pin by polling for RDY byte
  // seems to work best with some delays between transactions
  uint8_t SLOWDOWN = 0;
  if (i2c_dev)
    SLOWDOWN = 1;

  // write the command
  writecommand(cmd, cmdlen);

  // I2C TUNING
  delay(SLOWDOWN);

  // Wait for chip to say its ready!
  if (!waitready(timeout))
  {
    return false;
  }


  // read acknowledgement
  if (!readack())
  {
#ifdef PN532DEBUG
    PN532DEBUGPRINT.println(F("No ACK frame received!"));
#endif
    return false;
  }

  // I2C TUNING
  delay(SLOWDOWN);

  // Wait for chip to say its ready!
  if (!waitready(timeout))
  {
    return false;
  }

  return true; // ack'd command
}
