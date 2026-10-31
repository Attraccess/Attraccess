#include "reader_key_store.hpp"

#include "../../settings/reader_credentials.hpp"
#include "mbedtls/platform_util.h"

std::unique_ptr<IReaderKey> SoftwareReaderKeyStore::load()
{
    std::vector<uint8_t> scalar = CredentialStore::loadPrivateKey();
    if (scalar.empty())
    {
        return nullptr;
    }
    std::unique_ptr<IReaderKey> key = SoftwareReaderKey::fromPrivateKey(scalar.data(), scalar.size());
    mbedtls_platform_zeroize(scalar.data(), scalar.size());
    return key;
}

std::unique_ptr<IReaderKey> SoftwareReaderKeyStore::createNew()
{
    std::unique_ptr<SoftwareReaderKey> key = SoftwareReaderKey::generate();
    std::vector<uint8_t> scalar;
    const bool stored = key && key->exportPrivateKey(scalar) && CredentialStore::saveNewKey(scalar);
    mbedtls_platform_zeroize(scalar.data(), scalar.size());
    if (!stored)
    {
        return nullptr;
    }
    return key;
}

bool SoftwareReaderKeyStore::erase()
{
    return CredentialStore::eraseKey();
}
