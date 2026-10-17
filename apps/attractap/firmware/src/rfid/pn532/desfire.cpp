// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.
#include "internal.hpp"

/*!
    @brief   Send a DESFire CreateApplication to the picc (native command
   0xCA, ISO7816-wrapped). On factory cards the default PICC master key
   settings (0x0F) permit this without prior authentication.

    @param   aid           3-byte application identifier, LSB first
    @param   keySettings1  application master key settings
    @param   keySettings2  number of keys | crypto method (0x80 = AES)

    @return  false on fail|true on success
*/
/**************************************************************************/
bool Adafruit_PN532::desfire_CreateApplication(const uint8_t *aid,
                                               uint8_t keySettings1,
                                               uint8_t keySettings2)
{
  uint8_t cmd_create[13] = {PN532_COMMAND_INDATAEXCHANGE,
                            0x01,
                            NTAG424_COM_CLA,
                            DESFIRE_CMD_CREATE_APPLICATION,
                            0x00,
                            0x00,
                            0x05,
                            aid[0],
                            aid[1],
                            aid[2],
                            keySettings1,
                            keySettings2,
                            0x00};
  if (!sendCommandCheckAck(cmd_create, sizeof(cmd_create)))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Failed to receive ACK for CreateApplication"));
#endif
    return false;
  }
  /* Read the response packet: D5 41 <status> 91 00 */
  readdata(pn532_packetbuffer, 12);
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("CreateApplication response: "));
  Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 12);
#endif
  if (pn532_packetbuffer[7] != 0x00 || pn532_packetbuffer[8] != 0x91 ||
      pn532_packetbuffer[9] != 0x00)
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("CreateApplication ResultError"));
#endif
    return false;
  }
  return true;
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

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

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

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
