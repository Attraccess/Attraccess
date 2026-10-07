// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



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
