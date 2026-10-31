#include "reader_identity.hpp"

#include <cstring>

#include "mbedtls/pk.h"
#include "mbedtls/platform_util.h"
#include "mbedtls/x509_crt.h"

namespace
{
    // SEQUENCE { SEQUENCE { id-ecPublicKey, prime256v1 }, BIT STRING (66 bytes) }
    constexpr uint8_t P256_SPKI_PREFIX[] = {0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d,
                                            0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01,
                                            0x07, 0x03, 0x42, 0x00};
    constexpr size_t POINT_BYTES = 65;

    psa_key_attributes_t keyAttributes()
    {
        psa_key_attributes_t attributes = PSA_KEY_ATTRIBUTES_INIT;
        psa_set_key_type(&attributes, PSA_KEY_TYPE_ECC_KEY_PAIR(PSA_ECC_FAMILY_SECP_R1));
        psa_set_key_bits(&attributes, 256);
        psa_set_key_usage_flags(&attributes, PSA_KEY_USAGE_SIGN_HASH | PSA_KEY_USAGE_EXPORT);
        psa_set_key_algorithm(&attributes, PSA_ALG_ECDSA(PSA_ALG_SHA_256));
        return attributes;
    }
}

SoftwareReaderKey::~SoftwareReaderKey()
{
    psa_destroy_key(key);
}

bool SoftwareReaderKey::loadPublicKey()
{
    uint8_t point[POINT_BYTES];
    size_t length = 0;
    if (psa_export_public_key(key, point, sizeof(point), &length) != PSA_SUCCESS || length != POINT_BYTES)
    {
        return false;
    }
    spki = ReaderIdentity::spkiFromPoint(point, length);
    return true;
}

std::unique_ptr<SoftwareReaderKey> SoftwareReaderKey::generate()
{
    if (psa_crypto_init() != PSA_SUCCESS)
    {
        return nullptr;
    }
    std::unique_ptr<SoftwareReaderKey> result(new SoftwareReaderKey());
    psa_key_attributes_t attributes = keyAttributes();
    if (psa_generate_key(&attributes, &result->key) != PSA_SUCCESS || !result->loadPublicKey())
    {
        return nullptr;
    }
    return result;
}

std::unique_ptr<SoftwareReaderKey> SoftwareReaderKey::fromPrivateKey(const uint8_t *scalar, size_t length)
{
    if (length != ReaderIdentity::PRIVATE_KEY_BYTES || psa_crypto_init() != PSA_SUCCESS)
    {
        return nullptr;
    }
    std::unique_ptr<SoftwareReaderKey> result(new SoftwareReaderKey());
    psa_key_attributes_t attributes = keyAttributes();
    if (psa_import_key(&attributes, scalar, length, &result->key) != PSA_SUCCESS || !result->loadPublicKey())
    {
        return nullptr;
    }
    return result;
}

bool SoftwareReaderKey::exportPrivateKey(std::vector<uint8_t> &out) const
{
    out.assign(ReaderIdentity::PRIVATE_KEY_BYTES, 0);
    size_t length = 0;
    if (psa_export_key(key, out.data(), out.size(), &length) != PSA_SUCCESS || length != out.size())
    {
        mbedtls_platform_zeroize(out.data(), out.size());
        out.clear();
        return false;
    }
    return true;
}

namespace ReaderIdentity
{
    std::vector<uint8_t> spkiFromPoint(const uint8_t *point, size_t length)
    {
        std::vector<uint8_t> spki(P256_SPKI_PREFIX, P256_SPKI_PREFIX + sizeof(P256_SPKI_PREFIX));
        spki.insert(spki.end(), point, point + length);
        return spki;
    }

    bool isCanonicalP256Spki(const std::vector<uint8_t> &spki)
    {
        return spki.size() == SPKI_BYTES && memcmp(spki.data(), P256_SPKI_PREFIX, sizeof(P256_SPKI_PREFIX)) == 0 &&
               spki[sizeof(P256_SPKI_PREFIX)] == 0x04;
    }

    bool selfSignedCertificate(const IReaderKey &key, std::vector<uint8_t> &der)
    {
        mbedtls_pk_context pk;
        mbedtls_pk_init(&pk);
        mbedtls_x509write_cert writer;
        mbedtls_x509write_crt_init(&writer);
        // The server ignores everything but the key: it never trusts this certificate.
        const uint8_t serial[] = {0x01};
        std::vector<uint8_t> buffer(1024);
        bool ok = mbedtls_pk_wrap_psa(&pk, key.keyId()) == 0;
        if (ok)
        {
            mbedtls_x509write_crt_set_version(&writer, MBEDTLS_X509_CRT_VERSION_3);
            mbedtls_x509write_crt_set_md_alg(&writer, MBEDTLS_MD_SHA256);
            mbedtls_x509write_crt_set_subject_key(&writer, &pk);
            mbedtls_x509write_crt_set_issuer_key(&writer, &pk);
            ok = mbedtls_x509write_crt_set_subject_name(&writer, "CN=Attractap reader") == 0 &&
                 mbedtls_x509write_crt_set_issuer_name(&writer, "CN=Attractap reader") == 0 &&
                 mbedtls_x509write_crt_set_serial_raw(&writer, serial, sizeof(serial)) == 0 &&
                 mbedtls_x509write_crt_set_validity(&writer, "20250101000000", "20991231235959") == 0;
        }
        int written = ok ? mbedtls_x509write_crt_der(&writer, buffer.data(), buffer.size()) : -1;
        mbedtls_x509write_crt_free(&writer);
        mbedtls_pk_free(&pk);
        if (written <= 0)
        {
            return false;
        }
        // The DER is written at the end of the buffer.
        der.assign(buffer.end() - written, buffer.end());
        return true;
    }
}
