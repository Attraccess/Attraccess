#include "session_certificates.hpp"

#include <cstring>

#include "pairing_codec.hpp"
#include "mbedtls/oid.h"
#include "mbedtls/pk.h"
#include "mbedtls/x509.h"
#include "mbedtls/x509_crt.h"
#include "psa/crypto.h"

namespace
{
    int64_t daysFromCivil(int year, unsigned month, unsigned day)
    {
        year -= month <= 2;
        const int64_t era = (year >= 0 ? year : year - 399) / 400;
        const unsigned yearOfEra = static_cast<unsigned>(year - era * 400);
        const unsigned dayOfYear = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1;
        const unsigned dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear;
        return era * 146097 + static_cast<int64_t>(dayOfEra) - 719468;
    }
}

namespace SessionCertificates
{
    bool pemToDer(const std::string &pem, std::vector<uint8_t> &der)
    {
        const std::string begin = "-----BEGIN CERTIFICATE-----";
        const std::string end = "-----END CERTIFICATE-----";
        const size_t start = pem.find(begin);
        const size_t stop = pem.find(end);
        if (start == std::string::npos || stop == std::string::npos || stop < start)
        {
            return false;
        }
        std::string body;
        for (size_t i = start + begin.size(); i < stop; i++)
        {
            if (pem[i] != '\n' && pem[i] != '\r' && pem[i] != ' ')
            {
                body += pem[i];
            }
        }
        return PairingCodec::base64Decode(body, der) && !der.empty();
    }

    bool signedByPinnedKey(const void *certificate, const std::vector<uint8_t> &caSpki)
    {
        const auto *crt = static_cast<const mbedtls_x509_crt *>(certificate);
        if (crt->MBEDTLS_PRIVATE(sig_md) != MBEDTLS_MD_SHA256 || crt->MBEDTLS_PRIVATE(sig_pk) != MBEDTLS_PK_SIGALG_ECDSA)
        {
            return false;
        }
        uint8_t hash[32];
        size_t hashLength = 0;
        if (psa_hash_compute(PSA_ALG_SHA_256, crt->tbs.p, crt->tbs.len, hash, sizeof(hash), &hashLength) != PSA_SUCCESS)
        {
            return false;
        }
        mbedtls_pk_context ca;
        mbedtls_pk_init(&ca);
        const bool ok = mbedtls_pk_parse_public_key(&ca, caSpki.data(), caSpki.size()) == 0 &&
                        mbedtls_pk_verify(&ca, MBEDTLS_MD_SHA256, hash, hashLength, crt->MBEDTLS_PRIVATE(sig).p,
                                          crt->MBEDTLS_PRIVATE(sig).len) == 0;
        mbedtls_pk_free(&ca);
        return ok;
    }

    bool uriSanValue(const void *certificate, const char *prefix, std::string &value)
    {
        const auto *crt = static_cast<const mbedtls_x509_crt *>(certificate);
        const size_t prefixLength = strlen(prefix);
        for (const mbedtls_x509_sequence *entry = &crt->subject_alt_names; entry && entry->buf.p; entry = entry->next)
        {
            mbedtls_x509_subject_alternative_name san;
            if (mbedtls_x509_parse_subject_alt_name(&entry->buf, &san) != 0)
            {
                continue;
            }
            bool found = false;
            if (san.type == MBEDTLS_X509_SAN_UNIFORM_RESOURCE_IDENTIFIER)
            {
                const auto &uri = san.san.unstructured_name;
                if (uri.len > prefixLength && memcmp(uri.p, prefix, prefixLength) == 0)
                {
                    value.assign(reinterpret_cast<const char *>(uri.p) + prefixLength, uri.len - prefixLength);
                    found = true;
                }
            }
            mbedtls_x509_free_subject_alt_name(&san);
            if (found)
            {
                return true;
            }
        }
        return false;
    }

    int64_t notAfterSeconds(const void *certificate)
    {
        const mbedtls_x509_time &time = static_cast<const mbedtls_x509_crt *>(certificate)->valid_to;
        return daysFromCivil(time.year, static_cast<unsigned>(time.mon), static_cast<unsigned>(time.day)) * 86400 +
               time.hour * 3600 + time.min * 60 + time.sec;
    }

    bool isReaderCertificate(const std::vector<uint8_t> &der, const std::vector<uint8_t> &readerSpki,
                             const std::vector<uint8_t> &caSpki, uint32_t readerId)
    {
        mbedtls_x509_crt crt;
        mbedtls_x509_crt_init(&crt);
        bool ok = mbedtls_x509_crt_parse_der(&crt, der.data(), der.size()) == 0;
        if (ok)
        {
            uint8_t buffer[160];
            const int length = mbedtls_pk_write_pubkey_der(&crt.pk, buffer, sizeof(buffer));
            std::string reader;
            ok = length > 0 && static_cast<size_t>(length) == readerSpki.size() &&
                 memcmp(buffer + sizeof(buffer) - length, readerSpki.data(), readerSpki.size()) == 0 &&
                 signedByPinnedKey(&crt, caSpki) &&
                 mbedtls_x509_crt_check_extended_key_usage(&crt, MBEDTLS_OID_CLIENT_AUTH,
                                                           MBEDTLS_OID_SIZE(MBEDTLS_OID_CLIENT_AUTH)) == 0 &&
                 uriSanValue(&crt, READER_URI_PREFIX, reader) && reader == std::to_string(readerId);
        }
        mbedtls_x509_crt_free(&crt);
        return ok;
    }
}
