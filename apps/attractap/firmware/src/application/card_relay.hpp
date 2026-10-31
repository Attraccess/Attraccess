#pragma once

// Relays one APDU at a time between the server and the card (ATT-1145).
//
// The server runs all card crypto: it sends a complete command (CARD_APDU), the reader sends it to
// the card and returns the answer (CARD_APDU_RESPONSE). The reader holds no keys and no card
// session; it only knows whether a conversation is open.
//
// CARD_APDU arrives on the websocket task, but the PN532 is only touched from the main loop, so the
// command is parked in a one-slot mailbox and executed by loop().
//
// Every card presentation gets its own detection id (sent with CARD_DETECTED). The server echoes it
// in CARD_APDU and CARD_CONVERSATION_END, so a late message for an earlier card can neither close
// nor take over the conversation of the card that is on the reader now.

#include <cstdint>
#include <cstring>
#include <functional>
#include <mutex>
#include "../rfid/rfid_contract.hpp"

class CardRelay
{
public:
    static constexpr uint8_t MAX_APDU_LENGTH = INfc::MAX_APDU_COMMAND_LENGTH;
    static constexpr uint8_t MAX_RESPONSE_LENGTH = INfc::MAX_APDU_RESPONSE_LENGTH;
    static constexpr size_t MAX_CONVERSATION_ID_LENGTH = 24;
    // The server ends a conversation after 15 s. A reader that never hears the end (connection
    // lost) must not keep the card to itself for longer than that plus a margin.
    static constexpr uint32_t MAX_CONVERSATION_MS = 20000;

    struct Hooks
    {
        // Sends the APDU to the card. false: the card did not answer (it is gone).
        std::function<bool(const uint8_t *apdu, uint8_t length, uint8_t *response, uint8_t *responseLength)> transceive;
        std::function<void(const char *conversationId, uint32_t seq, const uint8_t *response, uint8_t length)>
            sendResponse;
        std::function<void(const char *conversationId)> sendRemoved;
        // While true the NFC front end must not probe the card for presence.
        std::function<void(bool active)> setConversationActive;
    };

    explicit CardRelay(Hooks hooks) : hooks(std::move(hooks)) {}

    // The reader announces a card (CARD_DETECTED): from now on the server may send commands for it.
    // Returns the detection id that goes out with CARD_DETECTED.
    uint32_t begin(uint32_t nowMs)
    {
        std::lock_guard<std::mutex> lock(mutex);
        reset();
        active_ = true;
        startedAtMs = nowMs;
        detectionId_ = ++lastDetectionId;
        if (hooks.setConversationActive) hooks.setConversationActive(true);
        return detectionId_;
    }

    // Websocket task: a command from the server.
    void onApdu(uint32_t detectionId, const char *conversationId, uint32_t seq, const uint8_t *apdu, uint8_t length)
    {
        if (conversationId == nullptr || apdu == nullptr || length == 0 || length > MAX_APDU_LENGTH) return;
        if (strlen(conversationId) >= MAX_CONVERSATION_ID_LENGTH) return;
        std::lock_guard<std::mutex> lock(mutex);
        if (!active_) return; // not asked for: a command without a CARD_DETECTED is ignored
        if (detectionId != detectionId_) return; // meant for an earlier card
        if (conversationId_[0] == '\0') {
            strlcopy(conversationId_, conversationId);
        } else if (strcmp(conversationId_, conversationId) != 0) {
            return; // another conversation than the one this card is in
        }
        pending.valid = true;
        pending.seq = seq;
        pending.length = length;
        memcpy(pending.apdu, apdu, length);
    }

    // Websocket task: the server is done with this card (result already delivered). The server sends
    // this after every CARD_DETECTED, also when it answered with an error and never sent a command;
    // conversationId is then absent (nullptr).
    void onConversationEnd(uint32_t detectionId, const char *conversationId)
    {
        std::lock_guard<std::mutex> lock(mutex);
        if (!active_ || detectionId != detectionId_) return;
        if (conversationId_[0] != '\0' && conversationId != nullptr && strcmp(conversationId_, conversationId) != 0)
            return;
        close();
    }

    // The flow that opened the conversation left (cancel, timeout, card removed).
    void cancel()
    {
        std::lock_guard<std::mutex> lock(mutex);
        if (active_) close();
    }

    bool active() const
    {
        std::lock_guard<std::mutex> lock(mutex);
        return active_;
    }

    // Main loop: runs the parked command, if any.
    void loop(uint32_t nowMs)
    {
        Pending command;
        char id[MAX_CONVERSATION_ID_LENGTH];
        {
            std::lock_guard<std::mutex> lock(mutex);
            if (!active_) return;
            if (static_cast<uint32_t>(nowMs - startedAtMs) > MAX_CONVERSATION_MS) {
                close();
                return;
            }
            if (!pending.valid) return;
            command = pending;
            pending.valid = false;
            strlcopy(id, conversationId_);
        }

        uint8_t response[MAX_RESPONSE_LENGTH];
        uint8_t responseLength = sizeof(response);
        const bool answered =
            hooks.transceive && hooks.transceive(command.apdu, command.length, response, &responseLength);
        if (answered && responseLength > 0) {
            if (hooks.sendResponse) hooks.sendResponse(id, command.seq, response, responseLength);
            return;
        }

        // No answer: the card left the field. Tell the server and stop talking.
        if (hooks.sendRemoved) hooks.sendRemoved(id);
        std::lock_guard<std::mutex> lock(mutex);
        if (active_) close();
    }

private:
    struct Pending
    {
        bool valid = false;
        uint32_t seq = 0;
        uint8_t length = 0;
        uint8_t apdu[MAX_APDU_LENGTH] = {0};
    };

    static void strlcopy(char *to, const char *from)
    {
        size_t length = strlen(from);
        if (length > MAX_CONVERSATION_ID_LENGTH - 1) length = MAX_CONVERSATION_ID_LENGTH - 1;
        memcpy(to, from, length);
        to[length] = '\0';
    }

    void reset()
    {
        pending.valid = false;
        conversationId_[0] = '\0';
    }

    void close()
    {
        active_ = false;
        reset();
        if (hooks.setConversationActive) hooks.setConversationActive(false);
    }

    Hooks hooks;
    mutable std::mutex mutex;
    bool active_ = false;
    uint32_t startedAtMs = 0;
    // Per boot; the first card is 1.
    uint32_t lastDetectionId = 0;
    uint32_t detectionId_ = 0;
    char conversationId_[MAX_CONVERSATION_ID_LENGTH] = {0};
    Pending pending;
};
