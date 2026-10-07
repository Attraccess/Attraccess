// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/**************************************************************************/
/*!
    @brief   create short cmac by returning the uneven bytes (1,3,5,7,9).

    @param   key    signing key
    @param   input  inputbuffer
    @param   length length of inputbuffer
    @param   cmac   outputbuffer (>=8 bytes)

    @return
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_cmac_short(uint8_t *key, uint8_t *input,
                                           uint8_t length, uint8_t *cmac)
{
  uint8_t regularcmac[16];
  Adafruit_PN532::ntag424_cmac(key, input, length, regularcmac);
  uint8_t c = 0;
  for (int i = 1; i < 16; i += 2)
  {
    cmac[c] = regularcmac[i];
    c++;
  }

#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("INPUT: "));
  Adafruit_PN532::PrintHexChar(input, length);
  PN532DEBUGPRINT.print(F("CMAC: "));
  Adafruit_PN532::PrintHexChar(regularcmac, 16);
  PN532DEBUGPRINT.print(F("CMAC_SHORT: "));
  Adafruit_PN532::PrintHexChar(cmac, 8);
#endif
  return 0;
}
