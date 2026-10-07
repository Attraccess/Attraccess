// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/************** high level communication functions (handles both I2C and SPI) */

/**************************************************************************/
/*!
    @brief  Tries to read the SPI or I2C ACK signal
*/
/**************************************************************************/
bool Adafruit_PN532::readack()
{
  uint8_t ackbuff[6];

  readdata(ackbuff, 6);

  return (0 == memcmp((char *)ackbuff, (char *)pn532ack, 6));
}



/**************************************************************************/
/*!
    @brief  Return true if the PN532 is ready with a response.
*/
/**************************************************************************/
bool Adafruit_PN532::isready()
{
  // I2C ready check via reading RDY byte
  uint8_t rdy[1];
  if (!i2c_dev->read(rdy, 1))
  {
    return false;
  }
  return rdy[0] == PN532_I2C_READY;
}



/**************************************************************************/
/*!
    @brief  Waits until the PN532 is ready.

    @param  timeout   Timeout before giving up
*/
/**************************************************************************/
bool Adafruit_PN532::waitready(uint16_t timeout)
{
  uint16_t timer = 0;
  while (!isready())
  {
    if (timeout != 0)
    {
      timer += 2;
      if (timer > timeout)
      {
#ifdef PN532DEBUG
        PN532DEBUGPRINT.println("TIMEOUT!");
#endif
        return false;
      }
    }
    delay(2);
  }
  return true;
}



/**************************************************************************/
/*!
    @brief  Reads n bytes of data from the PN532 via SPI or I2C.

    @param  buff      Pointer to the buffer where data will be written
    @param  n         Number of bytes to be read
*/
/**************************************************************************/
void Adafruit_PN532::readdata(uint8_t *buff, uint8_t n)
{
  // I2C read
  uint8_t rbuff[n + 1]; // +1 for leading RDY byte
  i2c_dev->read(rbuff, n + 1);
  for (uint8_t i = 0; i < n; i++)
  {
    buff[i] = rbuff[i + 1];
  }
#ifdef PN532DEBUG
  PN532DEBUGPRINT.print(F("Reading: "));
  for (uint8_t i = 0; i < n; i++)
  {
    PN532DEBUGPRINT.print(F(" 0x"));
    PN532DEBUGPRINT.print(buff[i], HEX);
  }
  PN532DEBUGPRINT.println();
#endif
}



/**************************************************************************/
/*!
    @brief  Writes a command to the PN532, automatically inserting the
            preamble and required frame details (checksum, len, etc.)

    @param  cmd       Pointer to the command buffer
    @param  cmdlen    Command length in bytes
*/
/**************************************************************************/
void Adafruit_PN532::writecommand(uint8_t *cmd, uint8_t cmdlen)
{
  // I2C command write.
  uint8_t packet[8 + cmdlen];
  uint8_t LEN = cmdlen + 1;

  packet[0] = PN532_PREAMBLE;
  packet[1] = PN532_STARTCODE1;
  packet[2] = PN532_STARTCODE2;
  packet[3] = LEN;
  packet[4] = ~LEN + 1;
  packet[5] = PN532_HOSTTOPN532;
  uint8_t sum = 0;
  for (uint8_t i = 0; i < cmdlen; i++)
  {
    packet[6 + i] = cmd[i];
    sum += cmd[i];
  }
  packet[6 + cmdlen] = ~(PN532_HOSTTOPN532 + sum) + 1;
  packet[7 + cmdlen] = PN532_POSTAMBLE;

#ifdef PN532DEBUG
  Serial.print("Sending : ");
  for (int i = 1; i < 8 + cmdlen; i++)
  {
    Serial.print("0x");
    Serial.print(packet[i], HEX);
    Serial.print(", ");
  }
  Serial.println();
#endif

  i2c_dev->write(packet, 8 + cmdlen);
}
