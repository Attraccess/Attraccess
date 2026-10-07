// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



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
