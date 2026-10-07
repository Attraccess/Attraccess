// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/*!
    @brief   Send getCardUID request to picc. Works even if random uid is
   active. Authentication required (key0 only, but i am not sure)

    @param   buffer     response buffer for the carduid (7 byte)

    @return  size of uid
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_GetCardUID(uint8_t *buffer)
{
  uint8_t cmac_short[8];
  uint8_t cla[1] = {NTAG424_COM_CLA};
  uint8_t ins[1] = {NTAG424_CMD_GETCARDUUID};
  uint8_t p1[1] = {0x0};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {0x00};
  uint8_t cmd_data[1] = {0x00};
  uint8_t result[34];

  uint8_t resp_size = Adafruit_PN532::ntag424_apdu_send(
      cla, ins, p1, p2, cmd_header, 0, cmd_data, 0, 0, NTAG424_COMM_MODE_FULL,
      result, sizeof(result)

  );

  if ((resp_size > 4) && (result[resp_size - 2] == 0x91) &&
      (result[resp_size - 1] == 0x00))
  {
    memcpy(buffer, result, resp_size - 2);
    return resp_size - 2;
  }
  return 0;
}



/*!
    @brief   Send GetTTStatus request to picc. (TagTamper status) Authentication
   required

    @param   buffer     response buffer for the status (7 byte)

    @return  size of status
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_GetTTStatus(uint8_t *buffer)
{
  uint8_t cmac_short[8];
  uint8_t cla[1] = {NTAG424_COM_CLA};
  uint8_t ins[1] = {NTAG424_CMD_GETTTSTATUS};
  uint8_t p1[1] = {0x0};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {0x00};
  uint8_t cmd_data[1] = {0x00};
  uint8_t result[32];

  uint8_t resp_size = Adafruit_PN532::ntag424_apdu_send(
      cla, ins, p1, p2, cmd_header, 0, cmd_data, 0, 0, NTAG424_COMM_MODE_FULL,
      result, sizeof(result)

  );
  if ((resp_size > 2) && (result[resp_size - 2] == 0x91) &&
      (result[resp_size - 1] == 0x00))
  {
    memcpy(buffer, result, resp_size - 2);
    return resp_size - 2;
  }
  return 0;
}



/*!
    @brief   Send ReadSig request to picc. (Chip signature). Authentication
   required

    @param   buffer     response buffer for the signature

    @return  size of status
*/
/**************************************************************************/
// Attention: ReadSig crashes currently. Response exceeds
// sizeof(pn532_packetbuffer). Maybe multiple reads?
uint8_t Adafruit_PN532::ntag424_ReadSig(uint8_t *buffer)
{
  uint8_t cmac_short[8];
  uint8_t cla[1] = {NTAG424_COM_CLA};
  uint8_t ins[1] = {NTAG424_CMD_READSIG};
  uint8_t p1[1] = {0x0};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {0x00};
  uint8_t cmd_data[1] = {0x00};
  uint8_t result[58];
  uint8_t resp_size = Adafruit_PN532::ntag424_apdu_send(
      cla, ins, p1, p2, cmd_header, 0, cmd_data, 1, 0, NTAG424_COMM_MODE_MAC,
      result, sizeof(result));
  memcpy(buffer, result, resp_size);
  return resp_size;
}
