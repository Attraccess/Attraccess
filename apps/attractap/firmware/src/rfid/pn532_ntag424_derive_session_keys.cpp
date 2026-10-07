// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/**************************************************************************/
/*!
    @brief   derive sessionskeys from RndA and RNDB.

    @param   key         mac-key
    @param   RndA        RndA
    @param   RndB        RndB

    @return
*/
/**************************************************************************/
void Adafruit_PN532::ntag424_derive_session_keys(uint8_t *key, uint8_t *RndA,
                                                 uint8_t *RndB)
{
  uint8_t f1[2];
  uint8_t f2[6];
  uint8_t f3[6];
  uint8_t f4[10];
  uint8_t f5[8];
  uint8_t f2xor3[6];
  memcpy(&f1, RndA, 2);
  memcpy(&f2, RndA + 2, 6);
  memcpy(&f3, RndB, 6);
  memcpy(&f4, RndB + 6, 10);
  memcpy(&f5, RndA + 8, 8);
  // xor f2 & f3
  for (int i = 0; i < 6; ++i)
  {
    f2xor3[i] = f2[i] ^ f3[i];
  }
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.println(F("DERIVE SESSIONKEYS: "));
  PN532DEBUGPRINT.print(F("RndA: "));
  Adafruit_PN532::PrintHexChar(RndA, 16);
  PN532DEBUGPRINT.print(F("RndB: "));
  Adafruit_PN532::PrintHexChar(RndB, 16);
  PN532DEBUGPRINT.print(F("f1: "));
  Adafruit_PN532::PrintHexChar(f1, 2);
  PN532DEBUGPRINT.print(F("f2: "));
  Adafruit_PN532::PrintHexChar(f2, 6);
  PN532DEBUGPRINT.print(F("f3: "));
  Adafruit_PN532::PrintHexChar(f3, 6);
  PN532DEBUGPRINT.print(F("f4: "));
  Adafruit_PN532::PrintHexChar(f4, 10);
  PN532DEBUGPRINT.print(F("f5: "));
  Adafruit_PN532::PrintHexChar(f5, 8);
  PN532DEBUGPRINT.print(F("f2xorf3: "));
  Adafruit_PN532::PrintHexChar(f2xor3, 6);
#endif
  uint8_t sv1[32] = {
      0xA5, 0x5A, 0x00, 0x01, 0x00, 0x80, f1[0],
      f1[1], f2xor3[0], f2xor3[1], f2xor3[2], f2xor3[3], f2xor3[4], f2xor3[5],
      f4[0], f4[1], f4[2], f4[3], f4[4], f4[5], f4[6],
      f4[7], f4[8], f4[9], f5[0], f5[1], f5[2], f5[3],
      f5[4], f5[5], f5[6], f5[7]};
  uint8_t sv2[32] = {
      0x5A, 0xA5, 0x00, 0x01, 0x00, 0x80, f1[0],
      f1[1], f2xor3[0], f2xor3[1], f2xor3[2], f2xor3[3], f2xor3[4], f2xor3[5],
      f4[0], f4[1], f4[2], f4[3], f4[4], f4[5], f4[6],
      f4[7], f4[8], f4[9], f5[0], f5[1], f5[2], f5[3],
      f5[4], f5[5], f5[6], f5[7]};
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("SV1: "));
  Adafruit_PN532::PrintHexChar(sv1, 32);
  PN532DEBUGPRINT.print(F("SV2: "));
  Adafruit_PN532::PrintHexChar(sv2, 32);
#endif

  Adafruit_PN532::ntag424_cmac(key, sv1, 32, ntag424_Session.session_key_enc);
  Adafruit_PN532::ntag424_cmac(key, sv2, 32, ntag424_Session.session_key_mac);

#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("session_key_mac: "));
  Adafruit_PN532::PrintHexChar(ntag424_Session.session_key_mac,
                               NTAG424_SESSION_KEYSIZE);
  PN532DEBUGPRINT.print(F("session_key_enc: "));
  Adafruit_PN532::PrintHexChar(ntag424_Session.session_key_enc,
                               NTAG424_SESSION_KEYSIZE);
#endif
}
