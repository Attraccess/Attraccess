// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.
#include "../internal.hpp"

/*!
    @brief   Authenticate to start encrypted or signed communication.

    @param   key      encryption key
    @param   keyno   number of key to authenticate against (0-4)
    @param   cmd      0x71 or 0x77

    @return  1 = success; 0 = failed
*/
/**************************************************************************/

uint8_t Adafruit_PN532::ntag424_Authenticate(uint8_t *key, uint8_t keyno,
                                             uint8_t cmd)
{

#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("Authenticating with key: "));
  PN532DEBUGPRINT.println((char *)key);
#endif

// 1.) IsoSelectFile
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.println(F("1.) ISOSelectFile"));
#endif
  int cmd_len = 15;
  uint8_t cmd_select[cmd_len] = {PN532_COMMAND_INDATAEXCHANGE,
                                 0x01,
                                 0x00,
                                 0xA4,
                                 0x04,
                                 0x00,
                                 0x07,
                                 0xD2,
                                 0x76,
                                 0x00,
                                 0x00,
                                 0x85,
                                 0x01,
                                 0x01,
                                 0x00};
  /* Prepare the command */
  /* Send the command */
  if (!sendCommandCheckAck((uint8_t *)cmd_select, cmd_len))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Failed to receive ACK for write command"));
#endif
    return 0;
  }
  /* Read the response packet */
  readdata(pn532_packetbuffer, 26);
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("CMD: "));
  Adafruit_PN532::PrintHexChar(cmd_select, cmd_len);
  PN532DEBUGPRINT.println(strlen((char *)cmd_select));
  PN532DEBUGPRINT.print(F("Received: "));
  Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 26);
#endif

  /* If byte 8 isn't 0x00 we probably have an error, also byte 8 & 9 should be
   * 0x9000 */
  if (pn532_packetbuffer[7] != 0x00 || pn532_packetbuffer[8] != 0x90 ||
      pn532_packetbuffer[9] != 0x00)
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("ISOSelectFile ResultError"));
#endif
    return 0;
  }

  return ntag424_AuthenticateEV2First(key, keyno, cmd);
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

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

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

/*!
    @brief   Change key keynumber from oldkey to newkey.

    @param   oldkey       Current key (16 byte)
    @param   newkey       New key     (16 byte)
    @param   keynumber    Keynumber to change (0-4)

    @return  false=fail|true=success
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_ChangeKey(uint8_t *oldkey, uint8_t *newkey,
                                          uint8_t keynumber, uint8_t keyversion)
{
  uint8_t xorkey[16];
  for (int i = 0; i < 16; ++i)
  {
    xorkey[i] = oldkey[i] ^ newkey[i];
  }
  uint32_t crc32_newkey = Adafruit_PN532::ntag424_crc32(newkey, 16);
  // we need JAMCRCn which is the binary invers
  crc32_newkey = ~crc32_newkey;
#ifdef NTAG424DEBUG
  Serial.println("old key");
  Adafruit_PN532::PrintHex(oldkey, 16);
  Serial.println("new key");
  Adafruit_PN532::PrintHex(newkey, 16);
  Serial.println("XOR key");
  Adafruit_PN532::PrintHex(xorkey, 16);
  Serial.println("CRC32 key");
#endif
  uint8_t crcbytes[4];
  memcpy(crcbytes, &crc32_newkey, sizeof(uint32_t));
#ifdef NTAG424DEBUG
  Serial.printf("ROM CRC: %02X %02X %02X %02X\n", crcbytes[0], crcbytes[1],
                crcbytes[2], crcbytes[3]);
  Serial.println(crc32_newkey, HEX);
#endif
  // assemble keydata
  uint8_t keydata[32];
  uint8_t keydata_length = 21;
  if (keynumber > 0)
  {
    memcpy(keydata, xorkey, 16);
    keydata[16] = keyversion;
    memcpy(keydata + 17, crcbytes, 4);
    keydata_length = 21;
  }
  else if (keynumber == 0)
  {
    memcpy(keydata, newkey, 16);
    keydata[16] = keyversion;
    keydata_length = 17;
  }
#ifdef NTAG424DEBUG
  Serial.println("keydata:");
  Adafruit_PN532::PrintHex(keydata, keydata_length);
  Serial.println("Sessionkey ENC:");
  Adafruit_PN532::PrintHex(ntag424_Session.session_key_enc, 16);
#endif
  uint8_t cla[1] = {NTAG424_COM_CLA};
  uint8_t ins[1] = {NTAG424_COM_CHANGEKEY};
  uint8_t p1[1] = {0x0};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {keynumber};
  // uint8_t cmd_data[1] = {0x00};
  uint8_t result[50];

  uint8_t response_length = Adafruit_PN532::ntag424_apdu_send(
      cla, ins, p1, p2, cmd_header, 1, keydata, keydata_length, 0,
      NTAG424_COMM_MODE_FULL, result, sizeof(result)

  );
  Adafruit_PN532::PrintHex(result, response_length);

  // A full-mode response can retain its eight-byte CMAC before the status
  // trailer. The status is always the final two bytes.
  if (response_length < 2 || result[response_length - 2] != 0x91 ||
      result[response_length - 1] != 0x00)
  {
    return false;
  }
  return true;
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

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
