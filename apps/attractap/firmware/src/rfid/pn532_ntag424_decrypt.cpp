// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



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
