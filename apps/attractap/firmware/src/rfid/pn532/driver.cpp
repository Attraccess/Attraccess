// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.
#include "internal.hpp"

/**************************************************************************/
/*!
    @brief   Configures the SAM (Secure Access Module)
    @return  true on success, false otherwise.
*/
/**************************************************************************/
bool Adafruit_PN532::SAMConfig(void)
{
  pn532_packetbuffer[0] = PN532_COMMAND_SAMCONFIGURATION;
  pn532_packetbuffer[1] = 0x01; // normal mode;
  pn532_packetbuffer[2] = 0x14; // timeout 50ms * 20 = 1 second
  pn532_packetbuffer[3] = 0x01; // use IRQ pin!

  if (!sendCommandCheckAck(pn532_packetbuffer, 4))
    return false;

  // read data packet
  readdata(pn532_packetbuffer, 9);

  int offset = 6;
  return (pn532_packetbuffer[offset] == 0x15);
}

/**************************************************************************/
/*!
    Sets the MxRtyPassiveActivation byte of the RFConfiguration register

    @param  maxRetries    0xFF to wait forever, 0x00..0xFE to timeout
                          after mxRetries

    @returns 1 if everything executed properly, 0 for an error
*/
/**************************************************************************/
bool Adafruit_PN532::setPassiveActivationRetries(uint8_t maxRetries)
{
  pn532_packetbuffer[0] = PN532_COMMAND_RFCONFIGURATION;
  pn532_packetbuffer[1] = 5;    // Config item 5 (MaxRetries)
  pn532_packetbuffer[2] = 0xFF; // MxRtyATR (default = 0xFF)
  pn532_packetbuffer[3] = 0x01; // MxRtyPSL (default = 0x01)
  pn532_packetbuffer[4] = maxRetries;

#ifdef MIFAREDEBUG
  PN532DEBUGPRINT.print(F("Setting MxRtyPassiveActivation to "));
  PN532DEBUGPRINT.print(maxRetries, DEC);
  PN532DEBUGPRINT.println(F(" "));
#endif

  if (!sendCommandCheckAck(pn532_packetbuffer, 5))
    return 0x0; // no ACK

  return 1;
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

/**************************************************************************/
/*!
    @brief  Prints a hexadecimal value in plain characters

    @param  data      Pointer to the byte data
    @param  numBytes  Data length in bytes
*/
/**************************************************************************/
void Adafruit_PN532::PrintHex(const byte *data, const uint32_t numBytes)
{
  uint32_t szPos;
  for (szPos = 0; szPos < numBytes; szPos++)
  {
    PN532DEBUGPRINT.print(F("0x"));
    // Append leading 0 for small values
    if (data[szPos] <= 0xF)
      PN532DEBUGPRINT.print(F("0"));
    PN532DEBUGPRINT.print(data[szPos] & 0xff, HEX);
    if ((numBytes > 1) && (szPos != numBytes - 1))
    {
      PN532DEBUGPRINT.print(F(" "));
    }
  }
  PN532DEBUGPRINT.println();
}

/**************************************************************************/
/*!
    @brief  Prints a hexadecimal value in plain characters, along with
            the char equivalents in the following format

            00 00 00 00 00 00  ......

    @param  data      Pointer to the byte data
    @param  numBytes  Data length in bytes
*/
/**************************************************************************/
void Adafruit_PN532::PrintHexChar(const byte *data, const uint32_t numBytes)
{
  uint32_t szPos;
  for (szPos = 0; szPos < numBytes; szPos++)
  {
    // Append leading 0 for small values
    if (data[szPos] <= 0xF)
      PN532DEBUGPRINT.print(F("0"));
    PN532DEBUGPRINT.print(data[szPos], HEX);
    if ((numBytes > 1) && (szPos != numBytes - 1))
    {
      PN532DEBUGPRINT.print(F(" "));
    }
  }
  PN532DEBUGPRINT.print(F("  "));
  for (szPos = 0; szPos < numBytes; szPos++)
  {
    if (data[szPos] <= 0x1F)
      PN532DEBUGPRINT.print(F("."));
    else
      PN532DEBUGPRINT.print((char)data[szPos]);
  }
  PN532DEBUGPRINT.println();
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

/**************************************************************************/
/*!
    @brief  Checks the firmware version of the PN5xx chip

    @returns  The chip's firmware version and ID
*/
/**************************************************************************/
uint32_t Adafruit_PN532::getFirmwareVersion(void)
{
  uint32_t response;

  pn532_packetbuffer[0] = PN532_COMMAND_GETFIRMWAREVERSION;

  if (!sendCommandCheckAck(pn532_packetbuffer, 1))
  {
    return 0;
  }

  // read data packet
  readdata(pn532_packetbuffer, 13);

  // check some basic stuff
  if (0 != memcmp((char *)pn532_packetbuffer,
                  (char *)pn532response_firmwarevers, 6))
  {
#ifdef PN532DEBUG
    PN532DEBUGPRINT.println(F("Firmware doesn't match!"));
#endif
    return 0;
  }

  int offset = 7;
  response = pn532_packetbuffer[offset++];
  response <<= 8;
  response |= pn532_packetbuffer[offset++];
  response <<= 8;
  response |= pn532_packetbuffer[offset++];
  response <<= 8;
  response |= pn532_packetbuffer[offset++];

  return response;
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

/**************************************************************************/
/*!
    @brief   Writes an 8-bit value that sets the state of the PN532's GPIO
             pins.
    @param   pinstate  P3 pins state.

    @warning This function is provided exclusively for board testing and
             is dangerous since it will throw an error if any pin other
             than the ones marked "Can be used as GPIO" are modified!  All
             pins that can not be used as GPIO should ALWAYS be left high
             (value = 1) or the system will become unstable and a HW reset
             will be required to recover the PN532.

             pinState[0]  = P30     Can be used as GPIO
             pinState[1]  = P31     Can be used as GPIO
             pinState[2]  = P32     *** RESERVED (Must be 1!) ***
             pinState[3]  = P33     Can be used as GPIO
             pinState[4]  = P34     *** RESERVED (Must be 1!) ***
             pinState[5]  = P35     Can be used as GPIO

    @return  1 if everything executed properly, 0 for an error
*/
/**************************************************************************/
bool Adafruit_PN532::writeGPIO(uint8_t pinstate)
{
  // uint8_t errorbit;

  // Make sure pinstate does not try to toggle P32 or P34
  pinstate |= (1 << PN532_GPIO_P32) | (1 << PN532_GPIO_P34);

  // Fill command buffer
  pn532_packetbuffer[0] = PN532_COMMAND_WRITEGPIO;
  pn532_packetbuffer[1] = PN532_GPIO_VALIDATIONBIT | pinstate; // P3 Pins
  pn532_packetbuffer[2] = 0x00;                                // P7 GPIO Pins (not used ... taken by SPI)

#ifdef PN532DEBUG
  PN532DEBUGPRINT.print(F("Writing P3 GPIO: "));
  PN532DEBUGPRINT.println(pn532_packetbuffer[1], HEX);
#endif

  // Send the WRITEGPIO command (0x0E)
  if (!sendCommandCheckAck(pn532_packetbuffer, 3))
    return 0x0;

  // Read response packet (00 FF PLEN PLENCHECKSUM D5 CMD+1(0x0F) DATACHECKSUM
  // 00)
  readdata(pn532_packetbuffer, 8);

#ifdef PN532DEBUG
  PN532DEBUGPRINT.print(F("Received: "));
  PrintHex(pn532_packetbuffer, 8);
  PN532DEBUGPRINT.println();
#endif

  int offset = 6;
  return (pn532_packetbuffer[offset] == 0x0F);
}

/**************************************************************************/
/*!
    Reads the state of the PN532's GPIO pins

    @returns An 8-bit value containing the pin state where:

             pinState[0]  = P30
             pinState[1]  = P31
             pinState[2]  = P32
             pinState[3]  = P33
             pinState[4]  = P34
             pinState[5]  = P35
*/
/**************************************************************************/
uint8_t Adafruit_PN532::readGPIO(void)
{
  pn532_packetbuffer[0] = PN532_COMMAND_READGPIO;

  // Send the READGPIO command (0x0C)
  if (!sendCommandCheckAck(pn532_packetbuffer, 1))
    return 0x0;

  // Read response packet (00 FF PLEN PLENCHECKSUM D5 CMD+1(0x0D) P3 P7 IO1
  // DATACHECKSUM 00)
  readdata(pn532_packetbuffer, 11);

  /* READGPIO response should be in the following format:

    byte            Description
    -------------   ------------------------------------------
    b0..5           Frame header and preamble (with I2C there is an extra 0x00)
    b6              P3 GPIO Pins
    b7              P7 GPIO Pins (not used ... taken by SPI)
    b8              Interface Mode Pins (not used ... bus select pins)
    b9..10          checksum */

  int p3offset = 7;

#ifdef PN532DEBUG
  PN532DEBUGPRINT.print(F("Received: "));
  PrintHex(pn532_packetbuffer, 11);
  PN532DEBUGPRINT.println();
  PN532DEBUGPRINT.print(F("P3 GPIO: 0x"));
  PN532DEBUGPRINT.println(pn532_packetbuffer[p3offset], HEX);
  PN532DEBUGPRINT.print(F("P7 GPIO: 0x"));
  PN532DEBUGPRINT.println(pn532_packetbuffer[p3offset + 1], HEX);
  PN532DEBUGPRINT.print(F("IO GPIO: 0x"));
  PN532DEBUGPRINT.println(pn532_packetbuffer[p3offset + 2], HEX);
  // Note: You can use the IO GPIO value to detect the serial bus being used
  switch (pn532_packetbuffer[p3offset + 2])
  {
  case 0x00: // Using UART
    PN532DEBUGPRINT.println(F("Using UART (IO = 0x00)"));
    break;
  case 0x01: // Using I2C
    PN532DEBUGPRINT.println(F("Using I2C (IO = 0x01)"));
    break;
  case 0x02: // Using SPI
    PN532DEBUGPRINT.println(F("Using SPI (IO = 0x02)"));
    break;
  }
#endif

  return pn532_packetbuffer[p3offset];
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

/**************************************************************************/
/*!
    @brief  Setups the HW

    @returns  true if successful, otherwise false
*/
/**************************************************************************/
bool Adafruit_PN532::begin()
{
#ifdef NTAG424DEBUG
  Serial.println("NTAG424DEBUG: On");
  Serial.println("EncBuffer: 52");
#endif
  if (!i2c_dev)
  {
    return false;
  }
  // I2C initialization
  // PN532 will fail address check since its asleep, so suppress
  if (!i2c_dev->begin(false))
  {
    return false;
  }
  reset(); // HW reset - put in known state
  delay(10);
  wakeup(); // hey! wakeup!
  return true;
}

/**************************************************************************/
/*!
    @brief  Perform a hardware reset. Requires reset pin to have been provided.
*/
/**************************************************************************/
void Adafruit_PN532::reset(void)
{
  // RSTPD_N is not wired on any Attractap board — power-on reset only.
}

/**************************************************************************/
/*!
    @brief  Wakeup from LowVbat mode into Normal Mode.
*/
/**************************************************************************/
void Adafruit_PN532::wakeup(void)
{
  // PN532 will clock stretch I2C during SAMConfig as a "wakeup"

  // need to config SAM to stay in Normal Mode
  SAMConfig();
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

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
