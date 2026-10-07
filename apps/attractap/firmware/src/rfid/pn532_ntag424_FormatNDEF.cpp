// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/*!
    @brief   Zero the tags default file.

    @return  false on fail|true on success
*/
/**************************************************************************/
bool Adafruit_PN532::ntag424_FormatNDEF()
{
  uint8_t cmac_short[8];
  uint8_t cla[1] = {NTAG424_COM_ISOCLA};
  uint8_t ins[1] = {NTAG424_CMD_ISOUPDATEBINARY};
  uint8_t p1[1] = {0x84};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {0x00};
  uint8_t ndefdata[PN532_PACKBUFFSIZ - 10];
  uint8_t memsize = 248;
  memset(ndefdata, 0, sizeof(ndefdata));
  uint8_t result[12];
  bool ret = true;
  uint8_t offset = 0;
  uint8_t datalen = sizeof(ndefdata);
  for (int i = 0; i < memsize; i += sizeof(ndefdata))
  {
    Serial.print(i);
    Serial.print(": ");
    Serial.println(offset);
    p2[0] = offset;
    if ((offset + datalen) > memsize)
    {
      datalen = memsize - offset;
    }
    uint8_t bytesread = Adafruit_PN532::ntag424_apdu_send(
        cla, ins, p1, p2, cmd_header, 0, ndefdata, datalen, 0,
        NTAG424_COMM_MODE_PLAIN, result, sizeof(result)

    );
    if ((result[0] != 0x90) || (result[1] != 0x00))
    {
      ret = false;
    }
    offset += datalen;

    Serial.println(bytesread);
  }
  return ret;
}
