#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>

/**
 * The reader's view of the NFC front end. It detects cards and relays complete APDUs; it knows no
 * card keys and keeps no card session. All card crypto runs on the server.
 */
class INfc
{
public:
    // The PN532 driver's packet buffer is PN532_PACKBUFFSIZ (64) bytes. A command takes it after the
    // InDataExchange command byte and target number; an answer after the 8 bytes of frame header,
    // TFI, response code and status.
    // Longest command the PN532 accepts in one InDataExchange.
    static constexpr uint8_t MAX_APDU_COMMAND_LENGTH = 62;
    // Longest card answer (status bytes included) the reader can return from one InDataExchange.
    static constexpr uint8_t MAX_APDU_RESPONSE_LENGTH = 56;

    virtual ~INfc() = default;
    virtual void setup() = 0;
    virtual void loop() = 0;
    virtual void enableCardDetection() = 0;
    virtual void disableCardDetection() = 0;
    // Stop polling and the RF field until reboot, including across API reconnects.
    // Unlike disableCardDetection(), this also ends the current card session.
    // Return true only when RF shutdown has been confirmed.
    virtual bool suspend() = 0;
    virtual void resetCardPresence() = 0;
    virtual void setCardDetectionCallback(std::function<void(uint8_t *, uint8_t)> callback) = 0;
    virtual void setCardRemovalCallback(std::function<void(uint32_t)> callback) = 0;
    virtual bool isCardPresent() = 0;

    /**
     * Send one complete APDU to the card and return its answer (including the status bytes).
     * `responseLength` is the capacity on entry and the received length on return. Returns false
     * when the card did not answer, i.e. it is gone.
     */
    virtual bool transceive(const uint8_t *apdu, uint8_t apduLength, uint8_t *response, uint8_t *responseLength) = 0;

    /**
     * While a card conversation is running the server drives the card: the reader must not probe it
     * for presence in between, because the probe would end the card's session. Removal is then
     * noticed by a failed transceive().
     */
    virtual void setConversationActive(bool active) = 0;
};
