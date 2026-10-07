// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/*!
    @brief   Send a DESFire SelectApplication to the picc (native command
   0x5A, ISO7816-wrapped). Selecting an application terminates any active
   authentication session.

    @param   aid    3-byte application identifier, LSB first (master
   application = 00 00 00)

    @return  false on fail|true on success
*/
/**************************************************************************/
bool Adafruit_PN532::desfire_SelectApplication(const uint8_t *aid)
{
  uint8_t cmd_select[11] = {PN532_COMMAND_INDATAEXCHANGE,
                            0x01,
                            NTAG424_COM_CLA,
                            DESFIRE_CMD_SELECT_APPLICATION,
                            0x00,
                            0x00,
                            0x03,
                            aid[0],
                            aid[1],
                            aid[2],
                            0x00};
  if (!sendCommandCheckAck(cmd_select, sizeof(cmd_select)))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Failed to receive ACK for SelectApplication"));
#endif
    return false;
  }
  /* Read the response packet: D5 41 <status> 91 00 */
  readdata(pn532_packetbuffer, 12);
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("SelectApplication response: "));
  Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 12);
#endif
  if (pn532_packetbuffer[7] != 0x00 || pn532_packetbuffer[8] != 0x91 ||
      pn532_packetbuffer[9] != 0x00)
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("SelectApplication ResultError"));
#endif
    return false;
  }
  // selection invalidates any previous authentication
  ntag424_Session.authenticated = false;
  return true;
}
