#pragma once

#include <string>

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

    void beginReaderInitiated(const std::string &requesterName, uint32_t resourceId);
    void armWebInitiated(const API::SupervisionStartCommand &command);
    void beginWebInitiated(const API::SupervisionStartCommand &command);
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

    API &api;
    NFC &nfc;
    Beeper &beeper;
    Logger &logger;
    SupervisionScreen &screen;
    Phase phase = Phase::Idle;
    bool webInitiated = false;
    volatile bool pendingWebStart = false;
    volatile bool cardDetected = false;
    volatile bool keyReady = false;
    volatile bool cardRejected = false;
    volatile TerminalEvent terminalEvent = TerminalEvent::None;
    bool errorIsTerminal = false;
    volatile bool hintReady = false;
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
    void reset();
    void publishTerminalEvent(TerminalEvent event);
    void showError(bool terminal, uint32_t now);
};
#endif
