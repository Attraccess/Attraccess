#include "reader_credentials.hpp"

#include "kvstore.hpp"

namespace
{
    constexpr const char *NAMESPACE = "readerpair";
    constexpr size_t MAX_CERTIFICATE_BYTES = 2048;
    constexpr size_t MAX_KEY_BYTES = 64;
    constexpr size_t MAX_SPKI_BYTES = 128;

    std::vector<uint8_t> readBlob(KVStore &store, const char *key, size_t maxLength)
    {
        std::vector<uint8_t> value(maxLength);
        value.resize(store.getBytes(key, value.data(), value.size()));
        return value;
    }

    bool writeBlob(KVStore &store, const char *key, const std::vector<uint8_t> &value)
    {
        if (value.empty())
        {
            store.remove(key);
            return true;
        }
        return store.putBytes(key, value.data(), value.size()) == value.size();
    }
}

namespace CredentialStore
{
    ReaderCredentials load()
    {
        ReaderCredentials credentials;
        KVStore store;
        if (!store.begin(NAMESPACE, true))
        {
            return credentials;
        }
        credentials.caSpki = readBlob(store, "ca", MAX_SPKI_BYTES);
        credentials.readerId = store.getUInt("rid", 0);
        credentials.installationId = store.getString("inst", "");
        credentials.certificate = readBlob(store, "cert", MAX_CERTIFICATE_BYTES);
        return credentials;
    }

    std::vector<uint8_t> loadPrivateKey()
    {
        KVStore store;
        if (!store.begin(NAMESPACE, true))
        {
            return {};
        }
        return readBlob(store, "key", MAX_KEY_BYTES);
    }

    bool eraseKey()
    {
        KVStore store;
        return store.begin(NAMESPACE, false) && store.remove("key");
    }

    bool saveNewKey(const std::vector<uint8_t> &privateKey)
    {
        KVStore store;
        if (!store.begin(NAMESPACE, false))
        {
            return false;
        }
        store.remove("ca");
        store.remove("rid");
        store.remove("inst");
        store.remove("cert");
        return writeBlob(store, "key", privateKey);
    }

    bool savePin(const std::vector<uint8_t> &caSpki)
    {
        KVStore store;
        return store.begin(NAMESPACE, false) && writeBlob(store, "ca", caSpki);
    }

    bool clearPin()
    {
        KVStore store;
        if (!store.begin(NAMESPACE, false))
        {
            return false;
        }
        store.remove("rid");
        store.remove("inst");
        store.remove("cert");
        // The pin last: without it the reader never opens the bootstrap session again.
        return store.remove("ca");
    }

    bool saveGrant(uint32_t readerId, const std::string &installationId, const std::vector<uint8_t> &certificate)
    {
        KVStore store;
        if (!store.begin(NAMESPACE, false) || certificate.size() > MAX_CERTIFICATE_BYTES)
        {
            return false;
        }
        // The certificate last: a reader with a certificate but no ID would never reach the bootstrap again.
        return store.putUInt("rid", readerId) > 0 && store.putString("inst", installationId) > 0 &&
               writeBlob(store, "cert", certificate);
    }

    bool saveCertificate(const std::vector<uint8_t> &certificate)
    {
        KVStore store;
        return certificate.size() <= MAX_CERTIFICATE_BYTES && store.begin(NAMESPACE, false) &&
               writeBlob(store, "cert", certificate);
    }

    uint32_t timeFloorSeconds()
    {
        KVStore store;
        return store.begin(NAMESPACE, true) ? store.getUInt("floor", 0) : 0;
    }

    bool saveTimeFloorSeconds(uint32_t seconds)
    {
        KVStore store;
        return store.begin(NAMESPACE, false) && store.putUInt("floor", seconds) > 0;
    }
}
