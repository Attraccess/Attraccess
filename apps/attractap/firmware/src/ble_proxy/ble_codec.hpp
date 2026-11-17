#pragma once

// Protocol v1 wire format: parsing server requests and building the reader's answers.
// Every inbound value is bounded before it is decoded; nothing here ever logs or echoes payload bytes.

#include <ArduinoJson.h>
#include <string>

#include "ble_types.hpp"

namespace ble
{
    // Base64 (RFC 4648, padded). `maxBytes` is checked on the encoded length first, so an oversized value is
    // refused without decoding it.
    bool base64Decode(const char *text, size_t length, size_t maxBytes, Bytes &out);
    void base64Encode(const uint8_t *data, size_t length, std::string &out);

    // Lowercase 128-bit `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` only (the API normalizes).
    bool parseUuid(const char *text, Uuid &out);
    void formatUuid(const Uuid &uuid, char out[37]);
    // `AA:BB:CC:DD:EE:FF` (either case).
    bool parseAddress(const char *text, Address &out);
    void formatAddress(const Address &address, char out[18]);

    // True for every type this proxy handles (BLE_*); the API dispatch uses it.
    bool isRequestType(const char *type);

    // Parses one request. On failure `error` says why, and `command.requestId`/`sessionId`/`type` are set as far
    // as they could be read, so the caller can still answer it. An unknown `v` fails with INVALID_ARGUMENT
    // `protocol-version`.
    bool parseCommand(const char *type, JsonObjectConst payload, Command &command, Error &error);

    // --- reader -> server ---------------------------------------------------------------------------------
    // Each returns the complete EVENT message.
    std::string resultMessage(const char *sessionId, uint32_t requestId, const Error &error, const Bytes *value = nullptr,
                              uint16_t mtu = 0);
    std::string scanResultMessage(const char *sessionId, uint32_t requestId, const Error &error,
                                  const PsVector<Advertisement> *advertisements);
    // `error` set: the stream's terminal error (no value).
    std::string notificationMessage(const char *sessionId, uint32_t subscriptionId, uint32_t seq, const Error &error,
                                    const uint8_t *value, size_t length);
    std::string sessionEndedMessage(const char *sessionId, const char *reason, const char *detail);
    // The answer to a request refused before the state machine sees it (untrusted channel, malformed, no room).
    // Empty when it cannot be addressed: no requestId or sessionId, or a BLE_CANCEL (never answered).
    std::string refusalMessage(const Command &command, const Error &error);
}
