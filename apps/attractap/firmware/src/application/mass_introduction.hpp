#pragma once

#include <cstddef>
#include <cstdint>
#include "../display/messages.hpp"
#include "../rfid/rfid_contract.hpp"
#include "../api/api.hpp"
#include "../beeper/beeper.hpp"
#include "../logger/logger.hpp"

#include "freertos/FreeRTOS.h"

#ifdef HAS_LVGL_DISPLAY
#include "../display/screens/massIntroduction/massIntroductionScreen.hpp"

// Owns the reader side of one mass introduction session (ATT-1151). Websocket, NFC and touch
// callbacks only enqueue events here; NFC and UI work is performed on the main loop by
// takePendingStart() and tick(). Cards are handled one at a time: request the key, authenticate
// relay it to the server, show the server's result briefly, wait for the next card.
class MassIntroductionFlow {
public:
    enum class Outcome { None, ReturnToRouting };

    MassIntroductionFlow(API &api, INfc &nfc, Beeper &beeper, Logger &logger,
                         MassIntroductionScreen &screen);

    void onStart(const API::MassIntroductionStartCommand &command);
    void onResult(const API::MassIntroductionResult &result);
    void onEnd(const API::MassIntroductionEnd &end);
    void onCardDetected(const uint8_t *uid, uint8_t uidLength);
    void requestCancel();

    // Enters the scan screen for a queued start. A busy reader refuses it with
    // MASS_INTRODUCTION_CANCEL so the server detaches it instead of waiting.
    bool takePendingStart(uint32_t now, bool readerBusy);
    Outcome tick(uint32_t now);
    // A firmware update takes over the reader: leave (or refuse) and tell the server.
    void preempt(uint32_t now);
    // The server detaches the reader itself when the socket drops.
    void onDisconnect();
    bool active() const { return phase != Phase::Idle; }

private:
    enum class Phase { Idle, WaitingForCard, AwaitingResult, ShowingResult };
    enum class EventType : uint8_t { Start, CardDetected, Result, End, Cancel };
    // Session ids are UUIDs (36 characters).
    static constexpr size_t SESSION_ID_LEN = 48;
    static constexpr size_t NAME_LEN = 96;
    static constexpr size_t CODE_LEN = 48;
    struct Event {
        EventType type;
        bool success;
        bool alreadyIntroduced;
        uint8_t uid[7];
        uint8_t uidLength;
        uint32_t remainingMs;
        uint32_t participantCount;
        uint32_t receivedAtMs;
        char sessionId[SESSION_ID_LEN];
        char name[NAME_LEN];                       // target name (start) or participant username
        char introducer[API::MAX_USERNAME_LEN];
        char code[CODE_LEN];                       // error code, or end reason
    };

    API &api;
    INfc &nfc;
    Beeper &beeper;
    Logger &logger;
    MassIntroductionScreen &screen;

    // Fixed ring buffer rather than a FreeRTOS queue: producers run on the websocket, LVGL and main
    // tasks, and only the main loop consumes. Events are rare, so a short critical section suffices.
    static constexpr uint8_t QUEUE_CAPACITY = 8;
    portMUX_TYPE queueMux = portMUX_INITIALIZER_UNLOCKED;
    Event queue[QUEUE_CAPACITY] = {};
    uint8_t queueHead = 0;
    uint8_t queueCount = 0;

    bool pendingStart = false;
    char pendingSessionId[SESSION_ID_LEN] = {0};
    char pendingTargetName[NAME_LEN] = {0};
    char pendingIntroducer[API::MAX_USERNAME_LEN] = {0};
    uint32_t pendingReceivedAtMs = 0;
    uint32_t pendingRemainingMs = 0;

    Phase phase = Phase::Idle;
    bool leftFlow = false;
    char sessionId[SESSION_ID_LEN] = {0};
    char targetName[NAME_LEN] = {0};
    char introducerName[API::MAX_USERNAME_LEN] = {0};
    char participantName[NAME_LEN] = {0};
    uint32_t deadlineMs = 0;
    uint32_t durationMs = 0;
    uint32_t participantCount = 0;
    uint32_t phaseChangedAtMs = 0;
    bool cardDetected = false;
    uint8_t cardUid[7] = {0};
    uint8_t cardUidLength = 0;
    // The last successfully handled card, so a flickering card is not processed twice.
    uint8_t lastCardUid[7] = {0};
    uint8_t lastCardUidLength = 0;
    uint32_t lastCardHandledAtMs = 0;
    FirmwareI18n::Text statusMessage;

    static constexpr uint32_t RESULT_DWELL_MS = 3000;
    static constexpr uint32_t RESPONSE_TIMEOUT_MS = 10000;
    static constexpr uint32_t REPEAT_GUARD_MS = 3000;

    void enqueue(const Event &event);
    bool dequeue(Event &event);
    void processEvents(uint32_t now);
    void processEvent(const Event &event, uint32_t now);
    void handleStart(const Event &event);
    void handleResult(const Event &event, uint32_t now);
    bool isActiveSession(const char *id) const;
    void refuse(const char *id, const char *reason);
    void clearPendingStart();
    void enter(uint32_t now);
    void leave(const char *reason, bool notifyServer);
    void beginCard(uint32_t now);
    void showResult(MassIntroductionScreen::Status result, const FirmwareI18n::Text &message, uint32_t now);
    void render(MassIntroductionScreen::Status status);
};
#endif
