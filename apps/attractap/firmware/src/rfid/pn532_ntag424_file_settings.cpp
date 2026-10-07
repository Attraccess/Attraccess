// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/*!
    @brief   sends a GetFileSettings-call to the picc, copies result into
   buffer.

    @param   fileno       fileno
    @param   buffer       buffer
    @param   comm_mode    one off NTAG424_COMM_MODE_PLAIN, NTAG424_COMM_MODE_MAC
   or NTAG424_COMM_MODE_FULL

    @return  length of result
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_GetFileSettings(uint8_t fileno, uint8_t *buffer,
                                                uint8_t comm_mode)
{
  uint8_t cmac_short[8];
  uint8_t cla[1] = {NTAG424_COM_CLA};
  uint8_t ins[1] = {NTAG424_CMD_GETFILESETTINGS};
  uint8_t p1[1] = {0x0};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {fileno};
  uint8_t cmd_data[1] = {0x00};
  uint8_t result[64];
  int resultlength = Adafruit_PN532::ntag424_apdu_send(
      cla, ins, p1, p2, cmd_header, sizeof(cmd_header), cmd_data, 0, 0,
      comm_mode, result, sizeof(result)

  );
  memcpy(buffer, result, resultlength);
  return resultlength;
}



/*!
    @brief   sends a ChangeFileSettings-call to the picc.

    @param   fileno                 fileno
    @param   filesettings           buffer with encoded filesettings
    @param   filesettings_length    size of filesettings buffer
    @param   comm_mode    one off NTAG424_COMM_MODE_PLAIN, NTAG424_COMM_MODE_MAC
   or NTAG424_COMM_MODE_FULL

    @return  length of result
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_ChangeFileSettings(uint8_t fileno,
                                                   uint8_t *filesettings,
                                                   uint8_t filesettings_length,
                                                   uint8_t comm_mode)
{
  uint8_t cmac_short[8];
  uint8_t cla[1] = {NTAG424_COM_CLA};
  uint8_t ins[1] = {NTAG424_CMD_CHANGEFILESETTINGS};
  uint8_t p1[1] = {0x0};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {fileno};
  uint8_t cmd_data[1] = {0x0};
  uint8_t result[30];
  uint8_t resultlength = Adafruit_PN532::ntag424_apdu_send(
      cla, ins, p1, p2, cmd_header, sizeof(cmd_header), filesettings,
      filesettings_length, 0, comm_mode, result, sizeof(result));
  // memcpy(buffer, result, 16);
  return resultlength;
}
