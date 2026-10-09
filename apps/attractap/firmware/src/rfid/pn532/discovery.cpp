// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.
#include "internal.hpp"

/***** ISO14443A Commands ******/

/**************************************************************************/
/*!
    @brief   Waits for an ISO14443A target to enter the field and reads
             its ID.

    @param   cardbaudrate  Baud rate of the card
    @param   uid           Pointer to the array that will be populated
                           with the card's UID (up to 7 bytes)
    @param   uidLength     Pointer to the variable that will hold the
                           length of the card's UID.
    @param   timeout       Timeout in milliseconds.

    @return  1 if everything executed properly, 0 for an error
*/
/**************************************************************************/
bool Adafruit_PN532::readPassiveTargetID(uint8_t cardbaudrate, uint8_t *uid,
                                         uint8_t *uidLength, uint16_t timeout)
{
  pn532_packetbuffer[0] = PN532_COMMAND_INLISTPASSIVETARGET;
  pn532_packetbuffer[1] = 1; // max 1 cards at once (we can set this to 2 later)
  pn532_packetbuffer[2] = cardbaudrate;

  if (!sendCommandCheckAck(pn532_packetbuffer, 3, timeout))
  {
#ifdef PN532DEBUG
    PN532DEBUGPRINT.println(F("No card(s) read"));
#endif
    return 0x0; // no cards read
  }

  return readDetectedPassiveTargetID(uid, uidLength);
}

/**************************************************************************/
/*!
    @brief   Put the reader in detection mode, non blocking so interrupts
             must be enabled.
    @param   cardbaudrate  Baud rate of the card
    @return  1 if everything executed properly, 0 for an error
*/
/**************************************************************************/
bool Adafruit_PN532::startPassiveTargetIDDetection(uint8_t cardbaudrate)
{
  pn532_packetbuffer[0] = PN532_COMMAND_INLISTPASSIVETARGET;
  pn532_packetbuffer[1] = 1; // max 1 cards at once (we can set this to 2 later)
  pn532_packetbuffer[2] = cardbaudrate;

  return sendCommandCheckAck(pn532_packetbuffer, 3);
}

/**************************************************************************/
/*!
    Reads the ID of the passive target the reader has deteceted.

    @param  uid           Pointer to the array that will be populated
                          with the card's UID (up to 7 bytes)
    @param  uidLength     Pointer to the variable that will hold the
                          length of the card's UID.

    @returns 1 if everything executed properly, 0 for an error
*/
/**************************************************************************/
bool Adafruit_PN532::readDetectedPassiveTargetID(uint8_t *uid,
                                                 uint8_t *uidLength)
{
  // read data packet
  readdata(pn532_packetbuffer, 20);
  // check some basic stuff

  /* ISO14443A card response should be in the following format:

    byte            Description
    -------------   ------------------------------------------
    b0..6           Frame header and preamble
    b7              Tags Found
    b8              Tag Number (only one used in this example)
    b9..10          SENS_RES
    b11             SEL_RES
    b12             NFCID Length
    b13..NFCIDLen   NFCID                                      */

#ifdef MIFAREDEBUG
  PN532DEBUGPRINT.print(F("Found "));
  PN532DEBUGPRINT.print(pn532_packetbuffer[7], DEC);
  PN532DEBUGPRINT.println(F(" tags"));
#endif
  if (pn532_packetbuffer[7] != 1)
    return 0;

  uint16_t sens_res = pn532_packetbuffer[9];
  sens_res <<= 8;
  sens_res |= pn532_packetbuffer[10];
#ifdef MIFAREDEBUG
  PN532DEBUGPRINT.print(F("ATQA: 0x"));
  PN532DEBUGPRINT.println(sens_res, HEX);
  PN532DEBUGPRINT.print(F("SAK: 0x"));
  PN532DEBUGPRINT.println(pn532_packetbuffer[11], HEX);
#endif

  /* Card appears to be Mifare Classic */
  *uidLength = pn532_packetbuffer[12];
#ifdef MIFAREDEBUG
  PN532DEBUGPRINT.print(F("UID:"));
#endif
  for (uint8_t i = 0; i < pn532_packetbuffer[12]; i++)
  {
    uid[i] = pn532_packetbuffer[13 + i];
#ifdef MIFAREDEBUG
    PN532DEBUGPRINT.print(F(" 0x"));
    PN532DEBUGPRINT.print(uid[i], HEX);
#endif
  }
#ifdef MIFAREDEBUG
  PN532DEBUGPRINT.println();
#endif

  return 1;
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

/**************************************************************************/
/*!
    @brief   'InLists' a passive target. PN532 acting as reader/initiator,
             peer acting as card/responder.
    @return  true on success, false otherwise.
*/
/**************************************************************************/
bool Adafruit_PN532::inListPassiveTarget()
{
  pn532_packetbuffer[0] = PN532_COMMAND_INLISTPASSIVETARGET;
  pn532_packetbuffer[1] = 1;
  pn532_packetbuffer[2] = 0;

#ifdef PN532DEBUG
  PN532DEBUGPRINT.print(F("About to inList passive target"));
#endif

  if (!sendCommandCheckAck(pn532_packetbuffer, 3, 1000))
  {
#ifdef PN532DEBUG
    PN532DEBUGPRINT.println(F("Could not send inlist message"));
#endif
    return false;
  }

  if (!waitready(30000))
  {
    return false;
  }

  readdata(pn532_packetbuffer, sizeof(pn532_packetbuffer));

  if (pn532_packetbuffer[0] == 0 && pn532_packetbuffer[1] == 0 &&
      pn532_packetbuffer[2] == 0xff)
  {
    uint8_t length = pn532_packetbuffer[3];
    if (pn532_packetbuffer[4] != (uint8_t)(~length + 1))
    {
#ifdef PN532DEBUG
      PN532DEBUGPRINT.println(F("Length check invalid"));
      PN532DEBUGPRINT.println(length, HEX);
      PN532DEBUGPRINT.println((~length) + 1, HEX);
#endif
      return false;
    }
    if (pn532_packetbuffer[5] == PN532_PN532TOHOST &&
        pn532_packetbuffer[6] == PN532_RESPONSE_INLISTPASSIVETARGET)
    {
      if (pn532_packetbuffer[7] != 1)
      {
#ifdef PN532DEBUG
        PN532DEBUGPRINT.println(F("Unhandled number of targets inlisted"));
#endif
        PN532DEBUGPRINT.println(F("Number of tags inlisted:"));
        PN532DEBUGPRINT.println(pn532_packetbuffer[7]);
        return false;
      }

      _inListedTag = pn532_packetbuffer[8];
      PN532DEBUGPRINT.print(F("Tag number: "));
      PN532DEBUGPRINT.println(_inListedTag);

      return true;
    }
    else
    {
#ifdef PN532DEBUG
      PN532DEBUGPRINT.print(F("Unexpected response to inlist passive host"));
#endif
      return false;
    }
  }
  else
  {
#ifdef PN532DEBUG
    PN532DEBUGPRINT.println(F("Preamble missing"));
#endif
    return false;
  }

  return true;
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

/**************************************************************************/
/*!
    @brief   Exchanges an APDU with the currently inlisted peer

    @param   send            Pointer to data to send
    @param   sendLength      Length of the data to send
    @param   response        Pointer to response data
    @param   responseLength  Pointer to the response data length
    @return  true on success, false otherwise.
*/
/**************************************************************************/
bool Adafruit_PN532::inDataExchange(uint8_t *send, uint8_t sendLength,
                                    uint8_t *response,
                                    uint8_t *responseLength)
{
  if (sendLength > PN532_PACKBUFFSIZ - 2)
  {
#ifdef PN532DEBUG
    PN532DEBUGPRINT.println(F("APDU length too long for packet buffer"));
#endif
    return false;
  }
  uint8_t i;

  pn532_packetbuffer[0] = 0x40; // PN532_COMMAND_INDATAEXCHANGE;
  pn532_packetbuffer[1] = _inListedTag;
  for (i = 0; i < sendLength; ++i)
  {
    pn532_packetbuffer[i + 2] = send[i];
  }

  if (!sendCommandCheckAck(pn532_packetbuffer, sendLength + 2, 1000))
  {
#ifdef PN532DEBUG
    PN532DEBUGPRINT.println(F("Could not send APDU"));
#endif
    return false;
  }

  if (!waitready(1000))
  {
#ifdef PN532DEBUG
    PN532DEBUGPRINT.println(F("Response never received for APDU..."));
#endif
    return false;
  }

  readdata(pn532_packetbuffer, sizeof(pn532_packetbuffer));

  if (pn532_packetbuffer[0] == 0 && pn532_packetbuffer[1] == 0 &&
      pn532_packetbuffer[2] == 0xff)
  {
    uint8_t length = pn532_packetbuffer[3];
    if (pn532_packetbuffer[4] != (uint8_t)(~length + 1))
    {
#ifdef PN532DEBUG
      PN532DEBUGPRINT.println(F("Length check invalid"));
      PN532DEBUGPRINT.println(length, HEX);
      PN532DEBUGPRINT.println((~length) + 1, HEX);
#endif
      return false;
    }
    if (pn532_packetbuffer[5] == PN532_PN532TOHOST &&
        pn532_packetbuffer[6] == PN532_RESPONSE_INDATAEXCHANGE)
    {
      if ((pn532_packetbuffer[7] & 0x3f) != 0)
      {
#ifdef PN532DEBUG
        PN532DEBUGPRINT.println(F("Status code indicates an error"));
#endif
        return false;
      }

      length -= 3;

      if (length > *responseLength)
      {
        length = *responseLength; // silent truncation...
      }

      for (i = 0; i < length; ++i)
      {
        response[i] = pn532_packetbuffer[8 + i];
      }
      *responseLength = length;

      return true;
    }
    else
    {
      PN532DEBUGPRINT.print(F("Don't know how to handle this command: "));
      PN532DEBUGPRINT.println(pn532_packetbuffer[6], HEX);
      return false;
    }
  }
  else
  {
    PN532DEBUGPRINT.println(F("Preamble missing"));
    return false;
  }
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

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

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

/**************************************************************************/
/*!
    @brief   set the PN532 as iso14443a Target behaving as a SmartCard
    @return  true on success, false otherwise.
    @note    Author: Salvador Mendoza (salmg.net) new functions:
             -AsTarget
             -getDataTarget
             -setDataTarget
*/
/**************************************************************************/
uint8_t Adafruit_PN532::AsTarget()
{
  pn532_packetbuffer[0] = 0x8C;
  uint8_t target[] = {
      0x8C,             // INIT AS TARGET
      0x00,             // MODE -> BITFIELD
      0x08, 0x00,       // SENS_RES - MIFARE PARAMS
      0xdc, 0x44, 0x20, // NFCID1T
      0x60,             // SEL_RES
      0x01, 0xfe,       // NFCID2T MUST START WITH 01fe - FELICA PARAMS - POL_RES
      0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xc0,
      0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, // PAD
      0xff, 0xff,                               // SYSTEM CODE
      0xaa, 0x99, 0x88, 0x77, 0x66, 0x55, 0x44,
      0x33, 0x22, 0x11, 0x01, 0x00, // NFCID3t MAX 47 BYTES ATR_RES
      0x0d, 0x52, 0x46, 0x49, 0x44, 0x49, 0x4f,
      0x74, 0x20, 0x50, 0x4e, 0x35, 0x33, 0x32 // HISTORICAL BYTES
  };
  if (!sendCommandCheckAck(target, sizeof(target)))
    return false;

  // read data packet
  readdata(pn532_packetbuffer, 8);

  int offset = 6;
  return (pn532_packetbuffer[offset] == 0x15);
}

/**************************************************************************/
/*!
    @brief   Retrieve response from the emulation mode

    @param   cmd    = data
    @param   cmdlen = data length
    @return  true on success, false otherwise.
*/
/**************************************************************************/
uint8_t Adafruit_PN532::getDataTarget(uint8_t *cmd, uint8_t *cmdlen)
{
  uint8_t length;
  pn532_packetbuffer[0] = 0x86;
  if (!sendCommandCheckAck(pn532_packetbuffer, 1, 1000))
  {
    PN532DEBUGPRINT.println(F("Error en ack"));
    return false;
  }

  // read data packet
  readdata(pn532_packetbuffer, 64);
  length = pn532_packetbuffer[3] - 3;

  // if (length > *responseLength) {// Bug, should avoid it in the reading
  // target data
  //  length = *responseLength; // silent truncation...
  //}

  for (int i = 0; i < length; ++i)
  {
    cmd[i] = pn532_packetbuffer[8 + i];
  }
  *cmdlen = length;
  return true;
}

/**************************************************************************/
/*!
    @brief   Set data in PN532 in the emulation mode

    @param   cmd    = data
    @param   cmdlen = data length
    @return  true on success, false otherwise.
*/
/**************************************************************************/
uint8_t Adafruit_PN532::setDataTarget(uint8_t *cmd, uint8_t cmdlen)
{
  uint8_t length;
  // cmd1[0] = 0x8E; Must!

  if (!sendCommandCheckAck(cmd, cmdlen))
    return false;

  // read data packet
  readdata(pn532_packetbuffer, 8);
  length = pn532_packetbuffer[3] - 3;
  for (int i = 0; i < length; ++i)
  {
    cmd[i] = pn532_packetbuffer[8 + i];
  }
  // cmdl = 0
  cmdlen = length;

  int offset = 6;
  return (pn532_packetbuffer[offset] == 0x15);
}
