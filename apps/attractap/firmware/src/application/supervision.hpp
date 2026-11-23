#pragma once

#include <string>
#include "../display/messages.hpp"
#include "../rfid/rfid_contract.hpp"

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"

#ifdef SUPERVISION_FLOW_TEST
#include "supervision_test_deps.hpp"
#else
#include "../api/api.hpp"
#include "../beeper/beeper.hpp"
#include "../logger/logger.hpp"
#endif

#ifdef HAS_LVGL_DISPLAY
#ifndef SUPERVISION_FLOW_TEST
#include "../display/screens/supervision/supervisionScreen.hpp"
#endif

// Owns one supervision transaction. Websocket callbacks only enqueue events here;
// NFC and UI work is performed by tick() on the main loop.
class SupervisionFlow {
public:
    enum class Outcome { None, ReturnToRouting, Unlock, UnlockAndStartSession };

    SupervisionFlow(API &api, INfc &nfc, Beeper &beeper, Logger &logger,
                    SupervisionScreen &screen);

    void setup();
    // estimateMinutes: the duration estimate chosen before the request (ATT-43), 0 for none.
    void beginReaderInitiated(const std::string &requesterName, uint32_t resourceId, uint32_t estimateMinutes = 0);
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
        uint8_t cardUid[7];
        uint8_t cardUidLength;
        char error[64];
        // Display name only (never compared): the screen shows people by their display name.
        char requesterName[API::MAX_DISPLAY_NAME_LEN];
        uint32_t resourceId;
        uint32_t timeoutMs;
        uint32_t receivedAtMs;
        uint32_t supervisorNamesSequence; // RequestResult: the supervisorNames it wrote
    };

    API &api;
    INfc &nfc;
    Beeper &beeper;
    Logger &logger;
    SupervisionScreen &screen;
    QueueHandle_t eventQueue = nullptr;
    portMUX_TYPE overflowEventsMux = portMUX_INITIALIZER_UNLOCKED;
    Event overflowEvents[static_cast<uint8_t>(EventType::Count)] = {};
    bool hasOverflowEvent[static_cast<uint8_t>(EventType::Count)] = {};
    uint32_t overflowEventSequence[static_cast<uint8_t>(EventType::Count)] = {};
    // Starts at one so zero unambiguously marks counter rollover.
    uint32_t nextOverflowEventSequence = 1;
    // Supervisor display names of the latest RequestResult. They live here once instead of in every
    // queue slot (8 names of up to 79 bytes); guarded by overflowEventsMux. A RequestResult whose
    // sequence no longer matches was superseded by a newer one, which shows its own names.
    char supervisorNames[API::MAX_INTRODUCERS][API::MAX_DISPLAY_NAME_LEN] = {};
    uint8_t supervisorNameCount = 0;
    uint32_t supervisorNamesSequence = 0;
    Phase phase = Phase::Idle;
    bool webInitiated = false;
    bool pendingWebStart = false;
    bool cardDetected = false;
    // The server authenticated the supervisor card through the relay.
    bool cardVerified = false;
    bool cardRejected = false;
    TerminalEvent terminalEvent = TerminalEvent::None;
    bool errorIsTerminal = false;
    bool hintReady = false;
    uint8_t cardUid[7] = {0};
    uint8_t cardUidLength = 0;
    FirmwareI18n::Text errorMessage;
    FirmwareI18n::Text hintMessage;
    char requesterName[API::MAX_DISPLAY_NAME_LEN] = {0};
    uint32_t resourceId = 0;
    char armedRequesterName[API::MAX_DISPLAY_NAME_LEN] = {0};
    uint32_t armedResourceId = 0;
    uint32_t requestedAtMs = 0;
    uint32_t requestedTimeoutMs = 0;
    uint32_t activeDeadlineMs = 0;
    uint32_t phaseChangedAtMs = 0;

    static constexpr uint32_t TIMEOUT_MS = 30000;
    static constexpr uint32_t SUCCESS_DWELL_MS = 1200;
    static constexpr uint32_t ERROR_DWELL_MS = 1800;

    void enter(const char *requester, const FirmwareI18n::Text &hint, uint32_t now, uint32_t deadlineMs);
    void resetActiveTransaction();
    void clearPendingWebStart();
    void beginWebInitiated(uint32_t resourceId, const char *requesterName, uint32_t deadlineMs);
    void enqueueEvent(const Event &event);
    void clearOverflowEvents();
    void normalizeOverflowEventSequences();
    bool takeOverflowEvent(Event &event);
    void processEvents(bool stopWhenWebStart = false);
    void processEvent(const Event &event);
    void showSupervisorNames(const Event &event);
    void publishTerminalEvent(TerminalEvent event);
    void renderScreen(SupervisionScreen::Status status);
    void showError(bool terminal, uint32_t now);
};
#endif
