#pragma once
// The few PSA Crypto calls the firmware's card code makes, on top of the simulator's AES.
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <map>
#include <vector>
#include "virtual_card_crypto.hpp"

typedef int32_t psa_status_t;
typedef uint32_t psa_key_id_t;
typedef uint32_t psa_algorithm_t;
typedef uint32_t psa_key_type_t;
typedef uint32_t psa_key_usage_t;
typedef uint32_t psa_key_bits_t;
typedef psa_key_id_t mbedtls_svc_key_id_t;
#define MBEDTLS_SVC_KEY_ID_INIT 0
#define PSA_SUCCESS ((psa_status_t)0)
#define PSA_ERROR_BUFFER_TOO_SMALL ((psa_status_t)-138)
#define PSA_ERROR_GENERIC_ERROR ((psa_status_t)-132)
#define PSA_KEY_TYPE_AES ((psa_key_type_t)0x2400)
#define PSA_KEY_USAGE_SIGN_MESSAGE ((psa_key_usage_t)0x1000)
#define PSA_KEY_USAGE_ENCRYPT ((psa_key_usage_t)0x1)
#define PSA_KEY_USAGE_DECRYPT ((psa_key_usage_t)0x2)
#define PSA_ALG_CMAC ((psa_algorithm_t)0x03c00200)
#define PSA_ALG_CBC_NO_PADDING ((psa_algorithm_t)0x04404000)
#define PSA_MAC_LENGTH(a, b, c) 16

struct psa_key_attributes_t { uint32_t unused; };
#define PSA_KEY_ATTRIBUTES_INIT {0}
inline void psa_set_key_type(psa_key_attributes_t *, psa_key_type_t) {}
inline void psa_set_key_bits(psa_key_attributes_t *, psa_key_bits_t) {}
inline void psa_set_key_usage_flags(psa_key_attributes_t *, psa_key_usage_t) {}
inline void psa_set_key_algorithm(psa_key_attributes_t *, psa_algorithm_t) {}

inline std::map<psa_key_id_t, std::vector<uint8_t>> &psaKeys()
{
    static std::map<psa_key_id_t, std::vector<uint8_t>> keys;
    return keys;
}
inline psa_status_t psa_import_key(const psa_key_attributes_t *, const uint8_t *data, size_t length, psa_key_id_t *id)
{
    static psa_key_id_t next = 1;
    *id = next++;
    psaKeys()[*id] = std::vector<uint8_t>(data, data + length);
    return PSA_SUCCESS;
}
inline psa_status_t psa_destroy_key(psa_key_id_t id)
{
    psaKeys().erase(id);
    return PSA_SUCCESS;
}
inline psa_status_t psa_mac_compute(psa_key_id_t id, psa_algorithm_t, const uint8_t *input, size_t length, uint8_t *mac,
                                    size_t macSize, size_t *macLength)
{
    const auto result = VirtualCardCrypto::cmac(psaKeys().at(id).data(), std::vector<uint8_t>(input, input + length));
    if (macSize < 16) return PSA_ERROR_GENERIC_ERROR;
    memcpy(mac, result.data(), 16);
    *macLength = 16;
    return PSA_SUCCESS;
}

struct psa_cipher_operation_t
{
    psa_key_id_t key = 0;
    bool encrypt = false;
    uint8_t iv[16] = {0};
};
#define PSA_CIPHER_OPERATION_INIT {}
inline psa_status_t psa_cipher_encrypt_setup(psa_cipher_operation_t *op, psa_key_id_t id, psa_algorithm_t)
{
    op->key = id;
    op->encrypt = true;
    return PSA_SUCCESS;
}
inline psa_status_t psa_cipher_decrypt_setup(psa_cipher_operation_t *op, psa_key_id_t id, psa_algorithm_t)
{
    op->key = id;
    op->encrypt = false;
    return PSA_SUCCESS;
}
inline psa_status_t psa_cipher_set_iv(psa_cipher_operation_t *op, const uint8_t *iv, size_t length)
{
    if (length != 16) return PSA_ERROR_GENERIC_ERROR;
    memcpy(op->iv, iv, 16);
    return PSA_SUCCESS;
}
inline psa_status_t psa_cipher_update(psa_cipher_operation_t *op, const uint8_t *input, size_t length, uint8_t *output,
                                      size_t outputSize, size_t *outputLength)
{
    if (length % 16 != 0 || outputSize < length) return PSA_ERROR_GENERIC_ERROR;
    VirtualCardCrypto::Block iv;
    memcpy(iv.data(), op->iv, 16);
    const auto &key = psaKeys().at(op->key);
    const auto out = op->encrypt ? VirtualCardCrypto::cbcEncrypt(key.data(), iv, input, length)
                                 : VirtualCardCrypto::cbcDecrypt(key.data(), iv, input, length);
    memcpy(output, out.data(), length);
    *outputLength = length;
    return PSA_SUCCESS;
}
inline psa_status_t psa_cipher_finish(psa_cipher_operation_t *, uint8_t *, size_t, size_t *outputLength)
{
    *outputLength = 0;
    return PSA_SUCCESS;
}
inline psa_status_t psa_cipher_abort(psa_cipher_operation_t *) { return PSA_SUCCESS; }
