// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.
#include "../internal.hpp"

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

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

/**************************************************************************/
/*!
    @brief   create aes128-cmac.

    @param   key    signing key
    @param   input  inputbuffer
    @param   length length of inputbuffer
    @param   cmac   outputbuffer (>=16 bytes)

    @return
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_cmac(uint8_t *key, uint8_t *input,
                                     uint8_t length, uint8_t *cmac)
{
  // IDF v6 / mbedTLS 4.x: PSA Crypto API (legacy mbedtls_cipher_cmac_* moved
  // to private headers). AES-128-CMAC via PSA, auto-initialized at boot.
  psa_key_attributes_t attributes = PSA_KEY_ATTRIBUTES_INIT;
  psa_set_key_type(&attributes, PSA_KEY_TYPE_AES);
  psa_set_key_bits(&attributes, 128);
  psa_set_key_usage_flags(&attributes, PSA_KEY_USAGE_SIGN_MESSAGE);
  psa_set_key_algorithm(&attributes, PSA_ALG_CMAC);

  mbedtls_svc_key_id_t key_id = MBEDTLS_SVC_KEY_ID_INIT;
  psa_status_t status = psa_import_key(&attributes, key, 16, &key_id);
  if (status != PSA_SUCCESS)
  {
    return 0;
  }

  size_t mac_length = 0;
  status = psa_mac_compute(key_id, PSA_ALG_CMAC, input, length,
                           cmac, 16, &mac_length);
  psa_destroy_key(key_id);
  if (status != PSA_SUCCESS || mac_length != 16)
  {
    return 0;
  }
  return 1;
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

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

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

/**************************************************************************/
/*!
    @brief   wrapper for ntag424_decrypt with standard iv.

    @param   key    encryption key
    @param   length  sizeof input
    @param   input inputbuffer
    @param   output outputbuffer

    @return
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_decrypt(uint8_t *key, uint8_t length,
                                        uint8_t *input, uint8_t *output)
{
  uint8_t iv[16];
  memset(iv, 0, sizeof(iv));
  return ntag424_decrypt(key, iv, length, input, output);
}

/**************************************************************************/
/*!
    @brief   decrypt input's lengths bytes with aes 128 cbc into output.

    @param   key    encryption key
    @param   iv     initialization vector
    @param   length sizeof input
    @param   input  inputbuffer
    @param   output outputbuffer

    @return
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_decrypt(uint8_t *key, uint8_t *iv,
                                        uint8_t length, uint8_t *input,
                                        uint8_t *output)
{
  // PSA_ALG_CBC_NO_PADDING requires block-aligned (16-byte) input length
  // (Sourcery review PR #1691); fail explicitly, not as a silent PSA error.
  if ((length % 16u) != 0u)
  {
    return 0;
  }

  // IDF v6 / mbedTLS 4.x: PSA Crypto API (see ntag424_encrypt).
  psa_key_attributes_t attributes = PSA_KEY_ATTRIBUTES_INIT;
  psa_set_key_type(&attributes, PSA_KEY_TYPE_AES);
  psa_set_key_bits(&attributes, 128);
  psa_set_key_usage_flags(&attributes, PSA_KEY_USAGE_DECRYPT);
  psa_set_key_algorithm(&attributes, PSA_ALG_CBC_NO_PADDING);

  mbedtls_svc_key_id_t key_id = MBEDTLS_SVC_KEY_ID_INIT;
  psa_status_t status = psa_import_key(&attributes, key, 16, &key_id);
  if (status != PSA_SUCCESS)
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.print(F("psa_import_key failed: "));
    PN532DEBUGPRINT.println((int)status);
#endif
    return 0;
  }

  psa_cipher_operation_t op = PSA_CIPHER_OPERATION_INIT;
  size_t olen = 0;
  status = psa_cipher_decrypt_setup(&op, key_id, PSA_ALG_CBC_NO_PADDING);
  if (status == PSA_SUCCESS)
  {
    status = psa_cipher_set_iv(&op, iv, 16);
  }
  if (status == PSA_SUCCESS)
  {
    // output buffer must be exactly `length`; CBC-without-padding never
    // expands, and psa_cipher_update reports back the actual olen so we can
    // detect truncation instead of silently returning partial data.
    status = psa_cipher_update(&op, (const uint8_t *)input, length,
                               (uint8_t *)output, length, &olen);
  }
  if (status == PSA_SUCCESS)
  {
    size_t flen = 0;
    if (olen <= length)
    {
      status = psa_cipher_finish(&op, (uint8_t *)output + olen, length - olen, &flen);
    }
    else
    {
      status = PSA_ERROR_BUFFER_TOO_SMALL;
    }
    // CBC-without-padding never expands: total output must exactly equal the
    // input length. Fail explicitly on any mismatch (Sourcery PR #1691).
    if (status == PSA_SUCCESS && (olen + flen) != length)
    {
      status = PSA_ERROR_GENERIC_ERROR;
    }
  }
  psa_cipher_abort(&op);
  psa_destroy_key(key_id);
#ifdef NTAG424DEBUG
  if (status != PSA_SUCCESS)
  {
    PN532DEBUGPRINT.print(F("ntag424_decrypt failed: "));
    PN532DEBUGPRINT.println((int)status);
  }
#endif
  return (status == PSA_SUCCESS) ? 1 : 0;
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

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

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

/**************************************************************************/
/*!
    @brief   wrapper for ntag424_encrypt with standard iv.

    @param   key    encryption key
    @param   length  sizeof input
    @param   input inputbuffer
    @param   output outputbuffer

    @return
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_encrypt(uint8_t *key, uint8_t length,
                                        uint8_t *input, uint8_t *output)
{
  uint8_t iv[16];
  memset(iv, 0, sizeof(iv));
  return ntag424_encrypt(key, iv, length, input, output);
}

/**************************************************************************/
/*!
    @brief   encrypt input's lengths bytes with aes 128 cbc into output.

    @param   key    encryption key
    @param   iv     initialization vector
    @param   length sizeof input
    @param   input  inputbuffer
    @param   output outputbuffer

    @return
*/
/**************************************************************************/
// encrypt input's lengths bytes with aes 128 cbc into output
uint8_t Adafruit_PN532::ntag424_encrypt(uint8_t *key, uint8_t *iv,
                                        uint8_t length, uint8_t *input,
                                        uint8_t *output)
{
  // PSA_ALG_CBC_NO_PADDING requires the input length to be a multiple of the
  // AES block size (16 bytes); enforce it explicitly so an unaligned length
  // fails visibly here instead of as a silent PSA status 0 return
  // (Sourcery review PR #1691).
  if ((length % 16u) != 0u)
  {
    return 0;
  }

  // IDF v6 / mbedTLS 4.x: legacy mbedtls_aes_* moved to private headers, so
  // the supported interface is the PSA Crypto API (auto-initialized at boot).
  psa_key_attributes_t attributes = PSA_KEY_ATTRIBUTES_INIT;
  psa_set_key_type(&attributes, PSA_KEY_TYPE_AES);
  psa_set_key_bits(&attributes, 128);
  psa_set_key_usage_flags(&attributes, PSA_KEY_USAGE_ENCRYPT);
  psa_set_key_algorithm(&attributes, PSA_ALG_CBC_NO_PADDING);

  mbedtls_svc_key_id_t key_id = MBEDTLS_SVC_KEY_ID_INIT;
  psa_status_t status = psa_import_key(&attributes, key, 16, &key_id);
  if (status != PSA_SUCCESS)
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.print(F("psa_import_key failed: "));
    PN532DEBUGPRINT.println((int)status);
#endif
    return 0;
  }

  psa_cipher_operation_t op = PSA_CIPHER_OPERATION_INIT;
  size_t olen = 0;
  status = psa_cipher_encrypt_setup(&op, key_id, PSA_ALG_CBC_NO_PADDING);
  if (status == PSA_SUCCESS)
  {
    status = psa_cipher_set_iv(&op, iv, 16);
  }
  if (status == PSA_SUCCESS)
  {
    // output buffer must be exactly `length`; CBC-without-padding never
    // expands, and psa_cipher_update reports back the actual olen so we can
    // detect truncation instead of silently returning partial data.
    status = psa_cipher_update(&op, (const uint8_t *)input, length,
                               (uint8_t *)output, length, &olen);
  }
  if (status == PSA_SUCCESS)
  {
    size_t flen = 0;
    if (olen <= length)
    {
      status = psa_cipher_finish(&op, (uint8_t *)output + olen, length - olen, &flen);
    }
    else
    {
      status = PSA_ERROR_BUFFER_TOO_SMALL;
    }
    // CBC-without-padding never expands: total output must exactly equal the
    // input length. Fail explicitly on any mismatch (Sourcery PR #1691).
    if (status == PSA_SUCCESS && (olen + flen) != length)
    {
      status = PSA_ERROR_GENERIC_ERROR;
    }
  }
  psa_cipher_abort(&op);
  psa_destroy_key(key_id);
#ifdef NTAG424DEBUG
  if (status != PSA_SUCCESS)
  {
    PN532DEBUGPRINT.print(F("ntag424_encrypt failed: "));
    PN532DEBUGPRINT.println((int)status);
  }
#endif
  return (status == PSA_SUCCESS) ? 1 : 0;
}
