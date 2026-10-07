// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/*!
    @brief   Send a DESFire GetKeyVersion command for the selected
   application.

    @param   keynumber    Key number in the selected application
    @param   keyversion   Output key version byte

    @return  false on fail|true on success
*/
/**************************************************************************/
bool Adafruit_PN532::desfire_GetKeyVersion(uint8_t keynumber,
                                           uint8_t *keyversion)
{
  uint8_t cmd_get_version[9] = {PN532_COMMAND_INDATAEXCHANGE,
                                0x01,
                                NTAG424_COM_CLA,
                                DESFIRE_CMD_GET_KEY_VERSION,
                                0x00,
                                0x00,
                                0x01,
                                keynumber,
                                0x00};
  if (!sendCommandCheckAck(cmd_get_version, sizeof(cmd_get_version)))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Failed to receive ACK for GetKeyVersion"));
#endif
    return false;
  }

  /* Read the response packet: D5 41 <status> <version> 91 00 */
  readdata(pn532_packetbuffer, 13);
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("GetKeyVersion response: "));
  Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 13);
#endif
  if (pn532_packetbuffer[7] != 0x00 || pn532_packetbuffer[9] != 0x91 ||
      pn532_packetbuffer[10] != 0x00)
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("GetKeyVersion ResultError"));
#endif
    return false;
  }

  *keyversion = pn532_packetbuffer[8];
  return true;
}
