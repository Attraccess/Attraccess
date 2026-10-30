#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <vector>

#include "reader_identity.hpp"
#include "session_framing.hpp"

// TLS 1.3 client for attractap-session.v1, driven entirely by the caller: TLS records go out
// through `send` (one binary WebSocket frame each) and incoming binary frames are fed in. It never
// blocks. Mutual authentication: the reader presents its certificate, the server must present a
// certificate signed by the pinned installation CA key whose URI SAN names the installation. The
// host name plays no role. Not thread-safe; the owner serializes all calls.
class SessionTls
{
public:
    struct Config
    {
        const IReaderKey *key = nullptr;
        // Reader certificate (DER): the issued one, or a self-signed one for the bootstrap session.
        std::vector<uint8_t> certificate;
        // Pinned CA public key (SPKI); the server certificate must be signed by it.
        std::vector<uint8_t> caSpki;
        // Expected installation; empty on the bootstrap session, which learns it from the certificate.
        std::string installationId;
        // Server certificates that expired before this (Unix seconds) are refused.
        uint32_t timeFloorSeconds = 0;
    };

    enum class Status
    {
        Idle,
        Handshaking,
        Open,
        // The server could not prove it is the pinned installation.
        Untrusted,
        Failed,
        Closed,
    };

    using SendRecords = std::function<bool(const uint8_t *data, size_t length)>;

    SessionTls();
    ~SessionTls();
    SessionTls(const SessionTls &) = delete;
    SessionTls &operator=(const SessionTls &) = delete;

    // Starts the handshake (sends the ClientHello). Returns false when the config is unusable.
    bool begin(const Config &config, SendRecords send);
    // Feeds received TLS bytes; decoded inner frames go to onFrame. Returns the status afterwards.
    Status feed(const uint8_t *data, size_t length, const SessionFraming::Decoder::FrameCallback &onFrame);
    bool sendFrame(SessionFraming::FrameType type, const uint8_t *payload, size_t length);
    void close();

    Status status() const { return state; }
    bool open() const { return state == Status::Open; }
    // Installation named by the verified server certificate.
    const std::string &serverInstallationId() const { return verifiedInstallationId; }
    // mbedTLS error of the last failure (0 when none); safe to log.
    int lastError() const { return error; }

    // Public for the verification callback.
    int verifyServerCertificate(void *crt, int depth, uint32_t *flags);

private:
    struct Impl;
    std::unique_ptr<Impl> impl;
    Status state = Status::Idle;
    int error = 0;
    std::string verifiedInstallationId;
    bool pinVerified = false;
    bool pinRejected = false;
    Config config;
    SendRecords sendRecords;
    SessionFraming::Decoder decoder;

    Status advance(const SessionFraming::Decoder::FrameCallback &onFrame);
    void fail(int code, Status status = Status::Failed);
};
