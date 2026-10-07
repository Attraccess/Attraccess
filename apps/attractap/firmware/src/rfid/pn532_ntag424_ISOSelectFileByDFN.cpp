// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/*!
    @brief   Select the default ISO-7816-4 dedicated filename of the application
   file.

    @param   dfn      buffer containing the ISO-7816-4 dedicated filename

    @return  false on fail|true on success
*/
/**************************************************************************/
bool Adafruit_PN532::ntag424_ISOSelectFileByDFN(uint8_t *dfn)
{
  /* Prepare the command */
  uint8_t cmac_short[8];
  uint8_t cla[1] = {NTAG424_COM_ISOCLA};
  uint8_t ins[1] = {NTAG424_CMD_ISOSELECTFILE};
  uint8_t p1[1] = {0x4};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {0x00};
  uint8_t result[12];

  /* Send the command */
  Adafruit_PN532::ntag424_apdu_send(cla, ins, p1, p2, cmd_header, 0, dfn, 7, 0,
                                    NTAG424_COMM_MODE_PLAIN, result,
                                    sizeof(result));
  if ((result[0] != 0x90) || (result[1] != 0x00))
  {
    return false;
  }
  return true;
}
