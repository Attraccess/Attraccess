#pragma once

#include <string>

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"

#include "../api/api.hpp"
#include "../beeper/beeper.hpp"
#include "../logger/logger.hpp"
#include "../nfc/nfc.hpp"

#ifdef HAS_LVGL_DISPLAY
#include "../display/screens/supervision/supervisionScreen.hpp"

// Owns one supervision transaction. Websocket callbacks only enqueue events here;
// NFC and UI work is performed by tick() on the main loop.
class SupervisionFlow {
public:
    enum class Outcome { None, ReturnToRouting, Unlock, UnlockAndStartSession };

    SupervisionFlow(API &api, NFC &nfc, Beeper &beeper, Logger &logger,
                    SupervisionScreen &screen);

    void setup();
    void beginReaderInitiated(const std::string &requesterName, uint32_t resourceId);
    void armWebInitiated(const API::SupervisionStartCommand &command);
    bool takePendingWebStart(uint32_t now, bool readerBusy);
    void onDisconnect();
    bool active() const;
    void onCardDetected(const uint8_t *uid, uint8_t uidLength);
    void requestCancel();
    void onRequestResult(const API::SupervisionRequestResult &result);
    void onCardAuthentication(const API::SupervisorCardAuthenticationResponse &response);
    void onResolved(const API::SupervisionResolvedResult &result);
    Outcome tick(uint32_t now);

private:
    enum class Phase { Idle, WaitingForCard, RequestedAuth, Starting, Success, Error };
    enum class TerminalEvent { None, Cancelled, Resolved, Failed };
    enum class EventType { Cancel, CardDetected, RequestResult, CardAuthentication, Resolved, WebStart, Count };
    struct Event {
        EventType type;
        bool success;
        uint8_t keyNo;
        uint8_t keyLen;
        uint8_t cardUid[7];
        uint8_t cardUidLength;
        uint8_t keyBytes[16];
        uint8_t supervisorCount;
        char error[64];
        char requesterName[64];
        char supervisorNames[API::MAX_INTRODUCERS][API::MAX_USERNAME_LEN];
        uint32_t resourceId;
        uint32_t timeoutMs;
        uint32_t receivedAtMs;
    };

    API &api;
    NFC &nfc;
    Beeper &beeper;
    Logger &logger;
    SupervisionScreen &screen;
    QueueHandle_t eventQueue = nullptr;
    portMUX_TYPE overflowEventsMux = portMUX_INITIALIZER_UNLOCKED;
    Event overflowEvents[static_cast<uint8_t>(EventType::Count)] = {};
    bool hasOverflowEvent[static_cast<uint8_t>(EventType::Count)] = {};
    uint32_t overflowEventSequence[static_cast<uint8_t>(EventType::Count)] = {};
    uint32_t nextOverflowEventSequence = 0;
    Phase phase = Phase::Idle;
    bool webInitiated = false;
    bool pendingWebStart = false;
    bool cardDetected = false;
    bool keyReady = false;
    bool cardRejected = false;
    TerminalEvent terminalEvent = TerminalEvent::None;
    bool errorIsTerminal = false;
    bool hintReady = false;
    uint8_t cardUid[7] = {0};
    uint8_t cardUidLength = 0;
    uint8_t keyNo = 0;
    uint8_t keyBytes[16] = {0};
    char errorMessage[64] = {0};
    char hintMessage[160] = {0};
    char requesterName[64] = {0};
    uint32_t resourceId = 0;
    char armedRequesterName[64] = {0};
    uint32_t armedResourceId = 0;
    uint32_t requestedAtMs = 0;
    uint32_t requestedTimeoutMs = 0;
    uint32_t startedAtMs = 0;
    uint32_t phaseChangedAtMs = 0;

    static constexpr uint32_t TIMEOUT_MS = 30000;
    static constexpr uint32_t SUCCESS_DWELL_MS = 1200;
    static constexpr uint32_t ERROR_DWELL_MS = 1800;

    void enter(const char *requester, const char *hint, uint32_t now);
    void resetActiveTransaction();
    void clearPendingWebStart();
    void beginWebInitiated(uint32_t resourceId, const char *requesterName);
    void enqueueEvent(const Event &event);
    void clearOverflowEvents();
    bool takeOverflowEvent(Event &event);
    void processEvents(bool stopWhenWebStart = false);
    void processEvent(const Event &event);
    void publishTerminalEvent(TerminalEvent event);
    void showError(bool terminal, uint32_t now);
};
#endif
