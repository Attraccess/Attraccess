// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/*!
    @brief   Run the AuthenticateEV2First handshake against the currently
   selected application. Shared by NTAG424 (after ISOSelectFile of the NDEF
   application) and MIFARE DESFire EV2/EV3 (after desfire_SelectApplication).

    @param   key      encryption key
    @param   keyno    number of key to authenticate against
    @param   cmd      0x71 or 0x77

    @return  1 = success; 0 = failed
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_AuthenticateEV2First(uint8_t *key,
                                                     uint8_t keyno,
                                                     uint8_t cmd)
{
// AuthenticateFirst part 1
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.println(F("AuthenticateFirst part 1"));
#endif
  int cmd_len = 13;
  uint8_t cmd_auth1[cmd_len] = {PN532_COMMAND_INDATAEXCHANGE,
                                0x01,
                                0x90,
                                cmd,
                                0x00,
                                0x00,
                                0x05,
                                keyno,
                                0x03,
                                0x00,
                                0x00,
                                0x00,
                                0x00};
  /* Prepare the command */
  /* Send the command */
  if (!sendCommandCheckAck((uint8_t *)cmd_auth1, cmd_len))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Failed to receive ACK for write command"));
#endif
    return 0;
  }
  /* Read the response packet */
  readdata(pn532_packetbuffer, 26);
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("> AUTH 1: "));
  Adafruit_PN532::PrintHexChar(cmd_auth1, cmd_len);
  PN532DEBUGPRINT.print(F("Received: "));
  Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 26);
#endif

  /* If byte 8 isn't 0x00 we probably have an error, also byte 8 & 9 should be
   * 0x91AF */
  if (pn532_packetbuffer[7] != 0x00 || pn532_packetbuffer[24] != 0x91 ||
      pn532_packetbuffer[25] != 0xAF)
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("AuthenticateFirst part 1 ResultError"));
#endif
    return 0;
  }

  /*
   * prepare the answer
   */
  // copy the encrypted RndB
  uint8_t blocklength = 16;
  uint8_t RndA[16];
  uint8_t RndB[16];
  uint8_t RndAEnc[16];
  uint8_t RndBEnc[16];
  uint8_t RndBRotl[16];
  uint8_t answer[32];
  uint8_t answer_enc[32];
  memcpy(&RndBEnc, pn532_packetbuffer + 8, blocklength);
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("RndBEnc: "));
  Adafruit_PN532::PrintHexChar(RndBEnc, blocklength);
#endif
  if (!Adafruit_PN532::ntag424_decrypt(key, blocklength, RndBEnc, RndB))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Decryption error"));
#endif
    return 0;
  }
  memset(RndBRotl, 0, sizeof(RndBRotl));
  ntag424_rotl(RndB, RndBRotl, blocklength, 1);

  ntag424_random(RndA, blocklength);

#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("RndA: "));
  Adafruit_PN532::PrintHexChar(RndA, blocklength);
  PN532DEBUGPRINT.print(F("RndBEnc: "));
  Adafruit_PN532::PrintHexChar(RndBEnc, blocklength);
  PN532DEBUGPRINT.print(F("RndB: "));
  Adafruit_PN532::PrintHexChar(RndB, blocklength);
  PN532DEBUGPRINT.print(F("RndBRotl: "));
  Adafruit_PN532::PrintHexChar(RndBRotl, blocklength);
#endif
  memcpy(&answer, RndA, blocklength);
  memcpy(&answer[blocklength], RndBRotl, blocklength);
  if (!Adafruit_PN532::ntag424_encrypt(key, sizeof(answer), answer, answer_enc))
  {
    return 0;
  }
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.println(F("answer: "));
  Adafruit_PN532::PrintHexChar(answer, blocklength * 2);
  PN532DEBUGPRINT.println(F("answer_encrypted: "));
  Adafruit_PN532::PrintHexChar(answer_enc, blocklength * 2);
#endif

  /*
   * send the answer
   */
  uint8_t prefix[7] = {
      PN532_COMMAND_INDATAEXCHANGE, 0x01, 0x90, 0xaf, 0x00, 0x00, 0x20};
  uint8_t postfix[1] = {0x00};
  // Fixed-size (all sizeofs are compile-time constants) — the old VLA form
  // trips GCC 14's -Werror=dangling-pointer analysis.
  uint8_t apdu[sizeof(prefix) + sizeof(answer_enc) + sizeof(postfix)];
  const int apdusize = sizeof(apdu);
  memcpy(&apdu[0], prefix, sizeof(prefix));
  memcpy(&apdu[sizeof(prefix)], answer_enc, sizeof(answer_enc));
  memcpy(&apdu[sizeof(prefix) + sizeof(answer_enc)], postfix, sizeof(postfix));
  if (!sendCommandCheckAck((uint8_t *)apdu, apdusize))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Failed to receive ACK for write command"));
#endif
    return 0;
  }
  /* Read the response packet */
  readdata(pn532_packetbuffer, 42);
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.println(F("> AUTH 2 - PCD encrypted answer: "));
  Adafruit_PN532::PrintHexChar(apdu, apdusize);
  PN532DEBUGPRINT.print(F("Received: "));
  Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 42);
#endif
  if (pn532_packetbuffer[7] != 0x00 || pn532_packetbuffer[40] != 0x91 ||
      pn532_packetbuffer[41] != 0x00)
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("AuthenticateFirst part 2 ResultError"));
    Adafruit_PN532::PrintHexChar(&pn532_packetbuffer[8], 2);
#endif
    return 0;
  }

  return ntag424_finishAuthentication(key, RndA, RndB);
}
