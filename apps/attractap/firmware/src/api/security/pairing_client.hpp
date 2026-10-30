#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

#include "pairing_codec.hpp"
#include "reader_identity.hpp"

// Reader side of attractap-pairing.v1 (see apps/api/src/attractap/security/pairing.service.ts).
// It speaks over whatever the owner connected; it only produces text messages and decisions:
//   hello -> round (commitment) -> nonce -> reveal (check commitment, derive code) -> ... -> accepted
// Every derived code goes to State (screen, LED ring, serial marker). A request ends with an
// Outcome that tells the owner what to do next.
class PairingClient
{
public:
    enum class Outcome
    {
        // Still waiting (or nothing happened yet).
        None,
        // An admin approved: pin `serverPublicKey()` and open the session.
        Accepted,
        // This request is over; open a new one (same key) after retryDelayMs().
        Retry,
    };

    struct Firmware
    {
        std::string name;
        std::string variant;
        std::string version;
    };

    // Delays before a new request. The server's limits are per address, so never hammer it.
    static constexpr uint32_t RETRY_AFTER_EXPIRY_MS = 1000;
    static constexpr uint32_t RETRY_AFTER_ERROR_MS = 10000;
    static constexpr uint32_t RETRY_AFTER_LIMIT_MS = 60000;
    static constexpr size_t MAX_MESSAGE_BYTES = 4096;

    using SendText = std::function<bool(const std::string &message)>;

    PairingClient(const IReaderKey &key, bool lite, Firmware firmware);

    // The pairing connection is open: sends `hello` (with the binding ticket, if any).
    void start(const std::string &ticket, SendText send);
    // One text frame from the server.
    Outcome onMessage(const char *data, size_t length);
    // The connection went away without a decision.
    Outcome onDisconnected();

    uint32_t retryDelayMs() const { return retryDelay; }
    const std::vector<uint8_t> &serverPublicKey() const { return pinnedCandidate; }
    // Reason of the last failure ("expired", "busy", "commitment", ...); safe to log.
    const std::string &failureReason() const { return failure; }
    // Last derived code (6 characters, no hyphen); exposed for tests.
    const std::string &currentCode() const { return code; }

private:
    struct PendingRound
    {
        int round = 0;
        std::vector<uint8_t> commitment;
        std::vector<uint8_t> readerNonce;
        std::string appUrl;
        uint32_t rotatesInMs = 0;
        uint32_t expiresInMs = 0;
        uint32_t receivedAtMs = 0;
        bool revealed = false;
    };

    Outcome finish(const char *reason, uint32_t delayMs);

    const IReaderKey &key;
    bool lite;
    Firmware firmware;
    SendText send;
    std::vector<uint8_t> pinnedCandidate;
    PendingRound pending[2];
    bool active = false;
    uint32_t retryDelay = 0;
    std::string failure;
    std::string code;
};
