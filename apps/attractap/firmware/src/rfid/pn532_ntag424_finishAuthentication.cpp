// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"

uint8_t Adafruit_PN532::ntag424_finishAuthentication(uint8_t *key, uint8_t *RndA, uint8_t *RndB)
{
  // decrypt the response
  uint8_t auth2_response_enc[NTAG424_AUTHRESPONSE_ENC_SIZE];
  uint8_t auth2_response[NTAG424_AUTHRESPONSE_ENC_SIZE];
  memcpy(&auth2_response_enc, pn532_packetbuffer + 8,
         NTAG424_AUTHRESPONSE_ENC_SIZE);
  if (!Adafruit_PN532::ntag424_decrypt(key, NTAG424_AUTHRESPONSE_ENC_SIZE,
                                       auth2_response_enc, auth2_response))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Decryption error"));
#endif
    return 0;
  }
  // save the authresponse
  memcpy(&ntag424_authresponse_TI,
         auth2_response + NTAG424_AUTHRESPONSE_TI_OFFSET,
         NTAG424_AUTHRESPONSE_TI_SIZE);
  memcpy(&ntag424_authresponse_RNDA,
         auth2_response + NTAG424_AUTHRESPONSE_RNDA_OFFSET,
         NTAG424_AUTHRESPONSE_RNDA_SIZE);
  memcpy(&ntag424_authresponse_PDCAP2,
         auth2_response + NTAG424_AUTHRESPONSE_PDCAP2_OFFSET,
         NTAG424_AUTHRESPONSE_PDCAP2_SIZE);
  memcpy(&ntag424_authresponse_PCDCAP2,
         auth2_response + NTAG424_AUTHRESPONSE_PCDCAP2_OFFSET,
         NTAG424_AUTHRESPONSE_PCDCAP2_SIZE);
  // cleanup session
  ntag424_Session.cmd_counter = 0;

  // Return OK signal
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("Enrypted response: "));
  Adafruit_PN532::PrintHexChar(auth2_response_enc,
                               NTAG424_AUTHRESPONSE_ENC_SIZE);
  PN532DEBUGPRINT.print(F("Decrypted response: "));
  Adafruit_PN532::PrintHexChar(auth2_response, NTAG424_AUTHRESPONSE_ENC_SIZE);
  PN532DEBUGPRINT.print(F("TI: "));
  Adafruit_PN532::PrintHexChar(ntag424_authresponse_TI,
                               NTAG424_AUTHRESPONSE_TI_SIZE);
  PN532DEBUGPRINT.println(F("RNDA: "));
  Adafruit_PN532::PrintHexChar(ntag424_authresponse_RNDA,
                               NTAG424_AUTHRESPONSE_RNDA_SIZE);
  PN532DEBUGPRINT.println(F("PDCAP2: "));
  Adafruit_PN532::PrintHexChar(ntag424_authresponse_PDCAP2,
                               NTAG424_AUTHRESPONSE_PDCAP2_SIZE);
  PN532DEBUGPRINT.println(F("PCDCAP2: "));
  Adafruit_PN532::PrintHexChar(ntag424_authresponse_PCDCAP2,
                               NTAG424_AUTHRESPONSE_PCDCAP2_SIZE);
#endif
  // save the session data
  // Adafruit_PN532::ntag424_derive_session_keys(key, RndA, RndB);

  // test vectors
  /*
  uint8_t RndAs[16] =
  {0xB0,0x4D,0x07,0x87,0xC9,0x3E,0xE0,0xCC,0x8C,0xAC,0xC8,0xE8,0x6F,0x16,0xC6,0xFE};
  uint8_t RndBs[16] =
  {0xFA,0x65,0x9A,0xD0,0xDC,0xA7,0x38,0xDD,0x65,0xDC,0x7D,0xC3,0x86,0x12,0xAD,0x81};
  uint8_t TestSessionKey[16] =
  {0x82,0x48,0x13,0x4A,0x38,0x6E,0x86,0xEB,0x7F,0xAF,0x54,0xA5,0x2E,0x53,0x6C,0xB6};
  uint8_t TestTI[4] = {0x7A,0x21,0x08,0x5E} ;
  */
  Adafruit_PN532::ntag424_derive_session_keys(key, RndA, RndB);
  // Return OK signal
  return 1;
}
