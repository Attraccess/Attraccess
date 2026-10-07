// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/*!
    @brief   select file by fileid for the following commands.

    @param   fileid      fileid

    @return  false on fail|true on success
*/
/**************************************************************************/
bool Adafruit_PN532::ntag424_ISOSelectFileById(int fileid)
{
  // Select the default ISO-7816-4 name of the application file
  /* Prepare the command */
  uint8_t cmac_short[8];
  uint8_t cla[1] = {NTAG424_COM_ISOCLA};
  uint8_t ins[1] = {NTAG424_CMD_ISOSELECTFILE};
  uint8_t p1[1] = {0x0};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {0x00};
  uint8_t cmd_data[2] = {(byte)((fileid >> 8) & 0xff), (byte)(fileid & 0xff)};
  uint8_t result[12];

  /* Send the command */
  Adafruit_PN532::ntag424_apdu_send(cla, ins, p1, p2, cmd_header, 0, cmd_data,
                                    2, 0, NTAG424_COMM_MODE_PLAIN, result,
                                    sizeof(result)

  );
  if ((result[0] != 0x90) || (result[1] != 0x00))
  {
    return false;
  }
  return true;
}
