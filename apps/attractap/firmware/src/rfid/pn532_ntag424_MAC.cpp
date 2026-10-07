// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/**************************************************************************/
/*!
    @brief   sign the supplied data and return the size.

    @param   cmd              apducmd
    @param   cmdheader        buffer containing the commandheader
    @param   cmdheader_length length of commandheader
    @param   cmddata          buffer containing the command data
    @param   cmddata_length   length of commanddata. set to 0 if n/a
    @param   signature        outputbuffer for the signature

    @return
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_MAC(uint8_t *cmd, uint8_t *cmdheader,
                                    uint8_t cmdheader_length, uint8_t *cmddata,
                                    uint8_t cmddata_length,
                                    uint8_t *signature)
{
  return ntag424_MAC(ntag424_Session.session_key_mac, cmd, cmdheader,
                     cmdheader_length, cmddata, cmddata_length, signature);
}



/**************************************************************************/
/*!
    @brief   sign the supplied data.

    @param   key              mac-key
    @param   cmd              apducmd
    @param   cmdheader        buffer containing the commandheader
    @param   cmdheader_length length of commandheader
    @param   cmddata          buffer containing the command data
    @param   cmddata_length   length of commanddata. set to 0 if n/a
    @param   signature        outputbuffer for the signature

    @return
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_MAC(uint8_t *key, uint8_t *cmd,
                                    uint8_t *cmdheader,
                                    uint8_t cmdheader_length, uint8_t *cmddata,
                                    uint8_t cmddata_length,
                                    uint8_t *signature)
{
  // counter is LSB
  uint8_t counter[2] = {(uint8_t)(ntag424_Session.cmd_counter & 0xff),
                        (uint8_t)((ntag424_Session.cmd_counter >> 8) & 0xff)};
  uint8_t msglen = 1 + sizeof(counter) + NTAG424_AUTHRESPONSE_TI_SIZE +
                   cmdheader_length + cmddata_length;
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("mesglen: "));
  Serial.println(msglen);
#endif
  uint8_t mesg[msglen];
  uint8_t cmac_short[8];

  mesg[0] = cmd[0];
  memcpy(mesg + 1, counter, sizeof(counter));
  memcpy(mesg + 1 + sizeof(counter), ntag424_authresponse_TI,
         NTAG424_AUTHRESPONSE_TI_SIZE);
  memcpy(mesg + 1 + sizeof(counter) + NTAG424_AUTHRESPONSE_TI_SIZE, cmdheader,
         cmdheader_length);
  if (cmddata_length > 0)
  {
    memcpy(mesg + 1 + sizeof(counter) + NTAG424_AUTHRESPONSE_TI_SIZE +
               cmdheader_length,
           cmddata, cmddata_length);
  }
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("mesg: padded: "));
  Adafruit_PN532::PrintHexChar(mesg, msglen);
#endif
  Adafruit_PN532::ntag424_cmac_short(key, mesg, msglen, signature);
  return 0;
}
