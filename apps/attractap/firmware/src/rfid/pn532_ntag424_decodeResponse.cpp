// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"

uint8_t Adafruit_PN532::ntag424_decodeResponse(uint8_t *response, uint8_t response_length, uint8_t comm_mode)
{
  uint8_t resp_cmac_ok = 0;
  // check the responsemac if there is a MAC
  if ((response_length >= 10) && ((comm_mode == NTAG424_COMM_MODE_FULL) ||
                                  (comm_mode == NTAG424_COMM_MODE_MAC)))
  {
    uint8_t respcmac[8];
    memcpy(respcmac, response + (response_length - 10), 8);
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.print(F("response cmac:"));
    Adafruit_PN532::PrintHex(respcmac, 8);
#endif

    uint8_t *checkmacin = (uint8_t *)malloc(response_length + 6);
    uint8_t maclength = 0;
    checkmacin[0] = response[response_length - 1];
    checkmacin[1] = ntag424_Session.cmd_counter & 0xff;
    checkmacin[2] = (ntag424_Session.cmd_counter >> 8) & 0xff;
    memcpy(checkmacin + 3, ntag424_authresponse_TI,
           NTAG424_AUTHRESPONSE_TI_SIZE);
    uint8_t padded_respdata_length = 0;
    if (response_length > 10)
    {
      padded_respdata_length = response_length - 10;
      memcpy(checkmacin + 3 + NTAG424_AUTHRESPONSE_TI_SIZE, response,
             padded_respdata_length);
    }
    maclength = 3 + NTAG424_AUTHRESPONSE_TI_SIZE + padded_respdata_length;
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.print(F("checkcmac input: "));
    Adafruit_PN532::PrintHex(checkmacin, maclength);
#endif
    uint8_t checkmac[8];

    Adafruit_PN532::ntag424_cmac_short(ntag424_Session.session_key_mac,
                                       checkmacin, maclength, checkmac);
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.print(F("checkcmac:"));
    Adafruit_PN532::PrintHex(checkmac, 8);
#endif
    free(checkmacin);
    for (int i = 0; i < 8; i++)
    {
      if (respcmac[i] != checkmac[i])
      {
#ifdef NTAG424DEBUG
        PN532DEBUGPRINT.println(
            F("Response CMAC integrity error! (picc <> pcd)"));
        Adafruit_PN532::PrintHex(respcmac, 8);
        PN532DEBUGPRINT.print(F(" <> "));
        Adafruit_PN532::PrintHex(checkmac, 8);
#endif
        return 0;
      }
    }
    PN532DEBUGPRINT.println(F("Response CMAC ok! (picc == pcd)"));
  }
  // decrypt the response in mode.full
  // A successful write can contain only its CMAC and 0x9100 status trailer.
  // There is no encrypted payload to allocate or decrypt in that case.
  if ((response_length > 10) && (comm_mode == NTAG424_COMM_MODE_FULL))
  {
    uint8_t ivd[32];
    uint8_t ivde[16];
    ivd[0] = 0x5A;
    ivd[1] = 0xA5;
    memcpy(ivd + 2, ntag424_authresponse_TI, 4);
    ivd[6] = ntag424_Session.cmd_counter & 0xff;
    ivd[7] = (ntag424_Session.cmd_counter >> 8) & 0xff;
    memset(ivd + 7, 0, 25);
    // Serial.println("IV-init:");
    // Adafruit_PN532::PrintHex(iv, 16);
    // Same overflow as the command-IV path: only one block fits in ivde[16].
    if (!Adafruit_PN532::ntag424_encrypt(ntag424_Session.session_key_enc,
                                         sizeof(ivde), ivd, ivde))
    {
      return 0;
    }
    uint8_t *respplain = (uint8_t *)malloc(response_length - 10);
    if (respplain == nullptr)
    {
      return 0;
    }
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Encrypted Response(pcd < picc)"));
    Adafruit_PN532::PrintHex(response, response_length - 10);
#endif
    if (!Adafruit_PN532::ntag424_decrypt(ntag424_Session.session_key_enc, ivde,
                                         response_length - 10, response, respplain))
    {
      free(respplain);
      return 0;
    }
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Decrypted Response(pcd < picc)"));
    Adafruit_PN532::PrintHex(respplain, response_length - 10);
#endif
    // 10 byte = cmac+responsecode
    // Serial.println(response_length);
    memcpy(response, respplain, response_length - 10);
    uint8_t resp_no_padding = response_length - 10;
    if (response_length > 10)
    {
      // Scan from the end for ISO/IEC 7816-4 padding (0x80 … 0x00). Uses
      // uint8_t (as before the IDF v6 migration) but iterates i>0 with idx=i-1
      // so the loop terminates correctly: `i >= 0` on an unsigned type is
      // always true and would wrap 255→0 (OOB read) or trip -Wtype-limits.
      for (uint8_t i = response_length - 10; i > 0; i--)
      {
        uint8_t idx = i - 1;
        // Serial.println(idx);
        if (response[idx] == 0x00)
        {
          resp_no_padding = idx;
        }
        else if (response[idx] == 0x80)
        {
          resp_no_padding = idx;
          break;
        }
        else
        {
          // nopadding?
          break;
        }
      }
    }
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(resp_no_padding);
#endif
    free(respplain);
    memcpy(response + resp_no_padding, response + response_length - 2, 2);
    resp_no_padding += 2;
    memset(response + resp_no_padding, 0, response_length - resp_no_padding);
    response_length = resp_no_padding;
  }
  return response_length;
}
