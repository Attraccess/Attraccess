// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/*!
    @brief   write data_to_write to picc. (Chip signature).

    @param   data_to_write     buffer containg the data to write
    @param   length            length of the buffer

    @return  false on fail|true on success
*/
/**************************************************************************/
bool Adafruit_PN532::ntag424_ISOUpdateBinary(uint8_t *data_to_write,
                                             uint8_t length)
{
  uint8_t cmac_short[8];
  uint8_t cla[1] = {NTAG424_COM_ISOCLA};
  uint8_t ins[1] = {NTAG424_CMD_ISOUPDATEBINARY};
  uint8_t p1[1] = {0x84};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {0x00};
  uint8_t cmd_data[1] = {0x00};
  uint8_t result[12];

  uint8_t offset = 0;
  uint8_t datalen = PN532_PACKBUFFSIZ - 10;
  for (int i = 0; i < length; i += datalen)
  {
    Serial.print(i);
    Serial.print(": ");
    Serial.println(offset);
    p2[0] = offset;
    if ((offset + datalen) > length)
    {
      datalen = length - offset;
    }
    if (datalen > 0)
    {
      uint8_t bytesread = Adafruit_PN532::ntag424_apdu_send(
          cla, ins, p1, p2, cmd_header, 0, data_to_write + offset, datalen, 0,
          NTAG424_COMM_MODE_PLAIN, result, sizeof(result)

      );
    }
    offset += datalen;
  }
  if ((result[0] != 0x90) || (result[1] != 0x00))
  {
    return false;
  }
  return true;
}
