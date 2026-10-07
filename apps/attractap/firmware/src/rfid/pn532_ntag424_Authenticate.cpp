// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/*!
    @brief   Authenticate to start encrypted or signed communication.

    @param   key      encryption key
    @param   keyno   number of key to authenticate against (0-4)
    @param   cmd      0x71 or 0x77

    @return  1 = success; 0 = failed
*/
/**************************************************************************/

uint8_t Adafruit_PN532::ntag424_Authenticate(uint8_t *key, uint8_t keyno,
                                             uint8_t cmd)
{

#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("Authenticating with key: "));
  PN532DEBUGPRINT.println((char *)key);
#endif

// 1.) IsoSelectFile
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.println(F("1.) ISOSelectFile"));
#endif
  int cmd_len = 15;
  uint8_t cmd_select[cmd_len] = {PN532_COMMAND_INDATAEXCHANGE,
                                 0x01,
                                 0x00,
                                 0xA4,
                                 0x04,
                                 0x00,
                                 0x07,
                                 0xD2,
                                 0x76,
                                 0x00,
                                 0x00,
                                 0x85,
                                 0x01,
                                 0x01,
                                 0x00};
  /* Prepare the command */
  /* Send the command */
  if (!sendCommandCheckAck((uint8_t *)cmd_select, cmd_len))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Failed to receive ACK for write command"));
#endif
    return 0;
  }
  /* Read the response packet */
  readdata(pn532_packetbuffer, 26);
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("CMD: "));
  Adafruit_PN532::PrintHexChar(cmd_select, cmd_len);
  PN532DEBUGPRINT.println(strlen((char *)cmd_select));
  PN532DEBUGPRINT.print(F("Received: "));
  Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 26);
#endif

  /* If byte 8 isn't 0x00 we probably have an error, also byte 8 & 9 should be
   * 0x9000 */
  if (pn532_packetbuffer[7] != 0x00 || pn532_packetbuffer[8] != 0x90 ||
      pn532_packetbuffer[9] != 0x00)
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("ISOSelectFile ResultError"));
#endif
    return 0;
  }

  return ntag424_AuthenticateEV2First(key, keyno, cmd);
}
