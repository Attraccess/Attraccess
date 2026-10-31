#pragma once

#include <memory>

#include "reader_identity.hpp"

// Where the reader's identity key lives. ReaderLink only sees IReaderKey and this store; the store
// decides how a key is created and kept. A store backed by the ESP32-S3 Digital Signature peripheral
// (ATT-1166) can replace the software one without changes to ReaderLink.
class IReaderKeyStore
{
public:
    virtual ~IReaderKeyStore() = default;
    // The stored key; null when there is none or it is unusable.
    virtual std::unique_ptr<IReaderKey> load() = 0;
    // Creates and stores a new key, dropping everything bound to the previous one (pinned CA,
    // certificate). Null when that failed.
    virtual std::unique_ptr<IReaderKey> createNew() = 0;
    // Forgets the stored key.
    virtual bool erase() = 0;
};

// Software key: the raw P-256 scalar in NVS ("readerpair"/"key", see CredentialStore). The scalar
// only exists in RAM while it is read or written, and is wiped right after.
class SoftwareReaderKeyStore : public IReaderKeyStore
{
public:
    std::unique_ptr<IReaderKey> load() override;
    std::unique_ptr<IReaderKey> createNew() override;
    bool erase() override;
};
