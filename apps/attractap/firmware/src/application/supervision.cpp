#include "supervision.hpp"

#ifdef HAS_LVGL_DISPLAY
#ifndef SUPERVISION_FLOW_TEST
#include "platform.hpp"
#include "../display/display.hpp"
#endif

SupervisionFlow::SupervisionFlow(API &api, INfc &nfc, Beeper &beeper, Logger &logger,
                                 SupervisionScreen &screen)
    : api(api), nfc(nfc), beeper(beeper), logger(logger), screen(screen) {}

void SupervisionFlow::setup() {
    eventQueue = xQueueCreate(8, sizeof(Event));
    if (eventQueue == nullptr) {
        logger.error("Failed to create supervision event queue");
    }
}

void SupervisionFlow::resetActiveTransaction() {
    phase = Phase::Idle;
    webInitiated = false;
    cardDetected = keyReady = cardRejected = false;
    terminalEvent = TerminalEvent::None;
    errorIsTerminal = hintReady = false;
    cardUidLength = 0;
    activeDeadlineMs = 0;
    errorMessage[0] = hintMessage[0] = requesterName[0] = '\0';
}

void SupervisionFlow::clearPendingWebStart() {
    pendingWebStart = false;
    armedRequesterName[0] = '\0';
    armedResourceId = requestedAtMs = requestedTimeoutMs = 0;
}

void SupervisionFlow::enter(const char *requester, const char *hint, uint32_t now, uint32_t deadlineMs) {
    phase = Phase::WaitingForCard;
    cardDetected = keyReady = cardRejected = false;
    terminalEvent = TerminalEvent::None;
    errorIsTerminal = hintReady = false;
    errorMessage[0] = '\0';
    phaseChangedAtMs = now;
    activeDeadlineMs = deadlineMs;
    strlcpy(requesterName, requester, sizeof(requesterName));
    nfc.resetCardPresence();
    nfc.enableCardDetection();
    strlcpy(hintMessage, hint, sizeof(hintMessage));
    renderScreen(SupervisionScreen::STATUS_WAITING);
    screen.armCancelGuard();
    Display::transitionToScreen(&screen);
}

void SupervisionFlow::beginReaderInitiated(const std::string &requester, uint32_t id) {
    // Release a queued web transaction before the reader flow takes ownership.
    processEvents();
    if (pendingWebStart) {
        api.cancelSupervision();
    }
    clearPendingWebStart();
    if (eventQueue != nullptr) xQueueReset(eventQueue);
    clearOverflowEvents();
    resetActiveTransaction();
    resourceId = id;
    const uint32_t now = millis();
    enter(requester.c_str(), "Aufsichts-Karte auflegen oder per\nApp/Web bestätigen", now,
          now + TIMEOUT_MS);
    api.requestSupervision(resourceId);
}

void SupervisionFlow::armWebInitiated(const API::SupervisionStartCommand &command) {
    Event event = {};
    event.type = EventType::WebStart;
    event.resourceId = command.resourceId;
    event.timeoutMs = command.timeoutMs;
    event.receivedAtMs = millis();
    strlcpy(event.requesterName, command.requesterUsername.c_str(), sizeof(event.requesterName));
    enqueueEvent(event);
}

void SupervisionFlow::beginWebInitiated(uint32_t id, const char *requester, uint32_t deadlineMs) {
    webInitiated = true;
    resourceId = id;
    enter(requester, "Aufsichts-Karte auflegen", millis(), deadlineMs);
}

bool SupervisionFlow::takePendingWebStart(uint32_t now, bool readerBusy) {
    // Stop at the first start so terminal events queued after it are consumed
    // only after the flow has become active.
    processEvents(true);
    if (!pendingWebStart) return false;
    if (now - requestedAtMs > requestedTimeoutMs) {
        logger.debug("Ignoring supervision arm that outlived its request");
        clearPendingWebStart();
        return false;
    }
    if (readerBusy) {
        logger.debug("Reader is in use, releasing the supervision request");
        api.cancelSupervision();
        clearPendingWebStart();
        return false;
    }
    beginWebInitiated(armedResourceId, armedRequesterName, requestedAtMs + requestedTimeoutMs);
    clearPendingWebStart();
    return true;
}

void SupervisionFlow::onDisconnect() {
    resetActiveTransaction();
    clearPendingWebStart();
    if (eventQueue != nullptr) xQueueReset(eventQueue);
    clearOverflowEvents();
}
bool SupervisionFlow::active() const { return phase != Phase::Idle; }

void SupervisionFlow::onCardDetected(const uint8_t *uid, uint8_t uidLength) {
    Event event = {};
    event.type = EventType::CardDetected;
    event.cardUidLength = uidLength > sizeof(event.cardUid) ? sizeof(event.cardUid) : uidLength;
    memcpy(event.cardUid, uid, event.cardUidLength);
    enqueueEvent(event);
}

void SupervisionFlow::publishTerminalEvent(TerminalEvent event) {
    // Cancellation is an explicit local action and wins over concurrent
    // websocket outcomes until the transaction resets.
    if (event == TerminalEvent::Cancelled || terminalEvent == TerminalEvent::None) {
        terminalEvent = event;
    }
}

void SupervisionFlow::requestCancel() {
    Event event = {};
    event.type = EventType::Cancel;
    enqueueEvent(event);
}

void SupervisionFlow::onRequestResult(const API::SupervisionRequestResult &result) {
    Event event = {};
    event.type = EventType::RequestResult;
    event.success = result.success;
    event.supervisorCount = result.supervisorCount;
    strlcpy(event.error, result.error.c_str(), sizeof(event.error));
    for (uint8_t i = 0; i < result.supervisorCount; ++i) {
        strlcpy(event.supervisorNames[i], result.supervisorNames[i].c_str(),
                sizeof(event.supervisorNames[i]));
    }
    enqueueEvent(event);
}

void SupervisionFlow::onCardAuthentication(const API::SupervisorCardAuthenticationResponse &response) {
    Event event = {};
    event.type = EventType::CardAuthentication;
    event.keyNo = response.keyNo;
    event.keyLen = response.keyLen;
    memcpy(event.keyBytes, response.keyBytes, sizeof(event.keyBytes));
    strlcpy(event.error, response.error.c_str(), sizeof(event.error));
    enqueueEvent(event);
}

void SupervisionFlow::onResolved(const API::SupervisionResolvedResult &result) {
    Event event = {};
    event.type = EventType::Resolved;
    event.success = result.success;
    strlcpy(event.error, result.error.c_str(), sizeof(event.error));
    enqueueEvent(event);
}


#endif
