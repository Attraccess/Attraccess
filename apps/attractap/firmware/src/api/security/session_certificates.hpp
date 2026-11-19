#pragma once

#include <cstdint>
#include <string>
#include <vector>

// Certificate checks that are anchored in the pinned installation CA key rather than in a CA
// certificate (the reader only ever learns the CA's public key during pairing).
namespace SessionCertificates
{
    constexpr const char *INSTALLATION_URI_PREFIX = "urn:attraccess:installation:";
    constexpr const char *READER_URI_PREFIX = "urn:attraccess:reader:";

    bool pemToDer(const std::string &pem, std::vector<uint8_t> &der);

    // `crt` is an mbedtls_x509_crt; void keeps mbedTLS out of this header.
    bool signedByPinnedKey(const void *crt, const std::vector<uint8_t> &caSpki);
    bool uriSanValue(const void *crt, const char *prefix, std::string &value);
    int64_t notAfterSeconds(const void *crt);

    // A certificate the server issued to this reader: the reader's own key, signed by the pinned
    // CA, client auth, URI SAN naming `readerId`.
    bool isReaderCertificate(const std::vector<uint8_t> &der, const std::vector<uint8_t> &readerSpki,
                             const std::vector<uint8_t> &caSpki, uint32_t readerId);
}
