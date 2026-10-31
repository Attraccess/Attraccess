#include "pairing_client.hpp"

#include <ArduinoJson.h>
#include <cstring>

#include "../../logger/logger.hpp"
#include "../../platform.hpp"
#include "../../state/state.hpp"

namespace
{
    Logger logger("Pairing");
    constexpr uint32_t MAX_SECONDS = 24U * 60U * 60U;

    uint32_t secondsToMs(JsonVariantConst value)
    {
        if (!value.is<uint32_t>())
        {
            return 0;
        }
        const uint32_t seconds = value.as<uint32_t>();
        return (seconds > MAX_SECONDS ? MAX_SECONDS : seconds) * 1000U;
    }
}

PairingClient::PairingClient(const IReaderKey &key, bool lite, Firmware firmware, Clock clock)
    : key(key), lite(lite), firmware(std::move(firmware)), clock(clock)
{
}

uint32_t PairingClient::now() const
{
    return clock ? clock() : millis();
}

void PairingClient::start(const std::string &ticket, SendText sendText)
{
    send = std::move(sendText);
    pinnedCandidate.clear();
    current = PendingRound();
    rounds = 0;
    codeShown = false;
    failure.clear();
    code.clear();
    retryDelay = 0;
    active = true;
    // Pending from now on, without a code yet (Lite: white breathing until the first round).
    State::setEnrollmentRequested(lite);

    JsonDocument hello;
    hello["type"] = "hello";
    hello["v"] = 1;
    hello["kind"] = lite ? "lite" : "touch";
    hello["publicKey"] = PairingCodec::base64Encode(key.publicKeySpki());
    hello["firmware"]["name"] = firmware.name;
    hello["firmware"]["variant"] = firmware.variant;
    hello["firmware"]["version"] = firmware.version;
    if (!ticket.empty())
    {
        hello["ticket"] = ticket;
    }
    std::string message;
    serializeJson(hello, message);
    logger.info(ticket.empty() ? "Requesting pairing" : "Requesting pairing for this reader's record");
    if (!send || !send(message))
    {
        finish("send-failed", RETRY_AFTER_ERROR_MS);
    }
}

PairingClient::Outcome PairingClient::onMessage(const char *data, size_t length)
{
    if (!active)
    {
        return Outcome::None;
    }
    JsonDocument message;
    if (length > MAX_MESSAGE_BYTES || deserializeJson(message, data, length) != DeserializationError::Ok)
    {
        return finish("protocol", RETRY_AFTER_ERROR_MS);
    }
    const char *type = message["type"] | "";

    if (strcmp(type, "round") == 0)
    {
        return onRound(message);
    }

    if (strcmp(type, "reveal") == 0)
    {
        return onReveal(message);
    }

    if (strcmp(type, "accepted") == 0)
    {
        // Only a server that revealed a round we checked can have been approved with our code.
        if (!codeShown)
        {
            return finish("protocol", RETRY_AFTER_ERROR_MS);
        }
        active = false;
        logger.info("Pairing approved");
        State::setEnrollmentOutcome(true);
        return Outcome::Accepted;
    }

    if (strcmp(type, "failed") == 0)
    {
        const char *reason = message["reason"] | "unknown";
        const bool limited = strcmp(reason, "busy") == 0 || strcmp(reason, "rate-limited") == 0;
        // A request ends after 10 minutes as a matter of course: ask again, quietly.
        if (strcmp(reason, "expired") == 0)
        {
            return finish(reason, RETRY_AFTER_EXPIRY_MS, true);
        }
        return finish(reason, limited ? RETRY_AFTER_LIMIT_MS : RETRY_AFTER_ERROR_MS);
    }

    return finish("protocol", RETRY_AFTER_ERROR_MS);
}

PairingClient::Outcome PairingClient::onRound(JsonDocument &message)
{
    const int round = message["round"] | 0;
    std::vector<uint8_t> serverKey;
    std::vector<uint8_t> commitment;
    if (round <= 0 || !PairingCodec::base64Decode(message["serverPublicKey"] | "", serverKey) ||
        !ReaderIdentity::isCanonicalP256Spki(serverKey) ||
        !PairingCodec::base64Decode(message["commitment"] | "", commitment) || commitment.size() != 32)
    {
        return finish("protocol", RETRY_AFTER_ERROR_MS);
    }
    // One request, one server key: a key that changes between rounds is an attack or a bug.
    if (!pinnedCandidate.empty() && pinnedCandidate != serverKey)
    {
        return finish("server-key-changed", RETRY_AFTER_ERROR_MS);
    }
    // Rounds at the server's pace only (see the class comment).
    const uint32_t receivedAt = now();
    if (rounds > 0)
    {
        if (round <= current.round || !current.revealed)
        {
            return finish("round-order", RETRY_AFTER_ERROR_MS);
        }
        if (receivedAt - current.receivedAtMs < MIN_ROUND_SPACING_MS)
        {
            return finish("round-too-early", RETRY_AFTER_ERROR_MS);
        }
    }
    if (rounds >= MAX_ROUNDS)
    {
        return finish("too-many-rounds", RETRY_AFTER_ERROR_MS);
    }
    rounds++;
    pinnedCandidate = serverKey;

    current = PendingRound();
    current.round = round;
    current.commitment = commitment;
    current.appUrl = message["appUrl"].is<const char *>() ? message["appUrl"].as<std::string>() : "";
    current.rotatesInMs = secondsToMs(message["rotatesInSeconds"]);
    current.expiresInMs = secondsToMs(message["expiresInSeconds"]);
    current.receivedAtMs = receivedAt;
    current.readerNonce.assign(PairingCodec::NONCE_BYTES, 0);
    if (psa_generate_random(current.readerNonce.data(), current.readerNonce.size()) != PSA_SUCCESS)
    {
        return finish("random", RETRY_AFTER_ERROR_MS);
    }

    JsonDocument reply;
    reply["type"] = "nonce";
    reply["round"] = round;
    reply["nonce"] = PairingCodec::base64Encode(current.readerNonce);
    std::string text;
    serializeJson(reply, text);
    if (!send(text))
    {
        return finish("send-failed", RETRY_AFTER_ERROR_MS);
    }
    return Outcome::None;
}

PairingClient::Outcome PairingClient::onReveal(JsonDocument &message)
{
    const int round = message["round"] | 0;
    std::vector<uint8_t> serverNonce;
    if (round <= 0 || current.round != round || current.revealed ||
        !PairingCodec::base64Decode(message["serverNonce"] | "", serverNonce) || serverNonce.empty())
    {
        return finish("protocol", RETRY_AFTER_ERROR_MS);
    }
    current.revealed = true;
    // The server committed to its nonce before it saw ours; a different nonce now means it
    // could have picked one that makes a code of its choice.
    if (!PairingCodec::commitmentMatches(current.commitment, pinnedCandidate, key.publicKeySpki(), serverNonce))
    {
        logger.error("Pairing commitment mismatch, starting a new request");
        return finish("commitment", RETRY_AFTER_ERROR_MS);
    }
    PairingCodec::Derived derived;
    if (!PairingCodec::derive(key.publicKeySpki(), pinnedCandidate, current.readerNonce, serverNonce, derived))
    {
        return finish("derive", RETRY_AFTER_ERROR_MS);
    }
    code = derived.code;
    codeShown = true;
    const uint32_t elapsed = now() - current.receivedAtMs;
    const uint32_t rotatesInMs = current.rotatesInMs > elapsed ? current.rotatesInMs - elapsed : 0;
    const uint32_t expiresInMs = current.expiresInMs > elapsed ? current.expiresInMs - elapsed : 0;
    const std::string display = PairingCodec::displayCode(derived.code);
    // The lab helper and the web flasher read this exact line from the UART.
    logger.infof("%s%s", State::ENROLLMENT_LOG_MARKER, display.c_str());
    State::setEnrollmentRound(display, current.appUrl, lite ? derived.pattern : nullptr, rotatesInMs, expiresInMs);
    return Outcome::None;
}

PairingClient::Outcome PairingClient::onDisconnected()
{
    if (!active)
    {
        return Outcome::None;
    }
    State::setEnrollmentDisconnected();
    active = false;
    failure = "disconnected";
    retryDelay = RETRY_AFTER_EXPIRY_MS;
    return Outcome::Retry;
}

PairingClient::Outcome PairingClient::finish(const char *reason, uint32_t delayMs, bool quiet)
{
    active = false;
    failure = reason;
    retryDelay = delayMs;
    if (quiet)
    {
        logger.infof("Pairing request ended (%s), new request in %u ms", reason, static_cast<unsigned>(delayMs));
    }
    else
    {
        logger.warnf("Pairing request ended (%s), new request in %u ms", reason, static_cast<unsigned>(delayMs));
        State::setEnrollmentOutcome(false);
    }
    // No current code until the next request shows one (Lite: white breathing).
    State::setEnrollmentDisconnected();
    return Outcome::Retry;
}
