#include "supervision.hpp"

#ifdef HAS_LVGL_DISPLAY
#include "platform.hpp"
#include "../display/display.hpp"

SupervisionFlow::SupervisionFlow(API &api, NFC &nfc, Beeper &beeper, Logger &logger,
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
    // A web arm is for a separate transaction. Drop arms and callbacks that
    // arrived before this reader-owned transaction can become active.
    clearPendingWebStart();
    if (eventQueue != nullptr) xQueueReset(eventQueue);
    clearOverflowEvents();
    resetActiveTransaction();
    resourceId = id;
    const uint32_t now = millis();
    enter(requester.c_str(), "Aufsichts-Karte auflegen oder per\nApp/Web bestaetigen", now,
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
    // Terminal outcomes are mutually exclusive. A local cancellation wins over
    // a concurrent websocket event because it represents an explicit user action.
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

void SupervisionFlow::enqueueEvent(const Event &event) {
    if (eventQueue == nullptr) {
        logger.error("Unable to queue supervision event: queue unavailable");
        return;
    }

    if (xQueueSend(eventQueue, &event, 0) == pdPASS) return;

    // API callbacks run from the same loop that drains this queue. Never wait
    // here: retain the latest event of each kind for the next main-loop tick.
    uint8_t index = static_cast<uint8_t>(event.type);
    portENTER_CRITICAL(&overflowEventsMux);
    if (nextOverflowEventSequence == 0) {
        // Preserve arrival order across counter rollover before assigning the
        // next retained event.
        normalizeOverflowEventSequences();
    }
    overflowEvents[index] = event;
    hasOverflowEvent[index] = true;
    overflowEventSequence[index] = nextOverflowEventSequence++;
    portEXIT_CRITICAL(&overflowEventsMux);
    logger.error("Supervision event queue full; retaining overflow event");
}

void SupervisionFlow::clearOverflowEvents() {
    portENTER_CRITICAL(&overflowEventsMux);
    memset(hasOverflowEvent, 0, sizeof(hasOverflowEvent));
    nextOverflowEventSequence = 1;
    portEXIT_CRITICAL(&overflowEventsMux);
}

void SupervisionFlow::normalizeOverflowEventSequences() {
    bool normalized[static_cast<uint8_t>(EventType::Count)] = {};
    uint32_t nextSequence = 0;

    for (uint8_t count = 0; count < static_cast<uint8_t>(EventType::Count); ++count) {
        uint8_t oldestIndex = static_cast<uint8_t>(EventType::Count);
        for (uint8_t i = 0; i < static_cast<uint8_t>(EventType::Count); ++i) {
            if (hasOverflowEvent[i] && !normalized[i] &&
                (oldestIndex == static_cast<uint8_t>(EventType::Count) ||
                 overflowEventSequence[i] < overflowEventSequence[oldestIndex])) {
                oldestIndex = i;
            }
        }
        if (oldestIndex == static_cast<uint8_t>(EventType::Count)) break;
        overflowEventSequence[oldestIndex] = nextSequence++;
        normalized[oldestIndex] = true;
    }
    nextOverflowEventSequence = nextSequence;
}

bool SupervisionFlow::takeOverflowEvent(Event &event) {
    bool found = false;
    portENTER_CRITICAL(&overflowEventsMux);
    uint8_t oldestIndex = static_cast<uint8_t>(EventType::Count);
    for (uint8_t i = 0; i < static_cast<uint8_t>(EventType::Count); ++i) {
        if (hasOverflowEvent[i] &&
            (oldestIndex == static_cast<uint8_t>(EventType::Count) ||
             overflowEventSequence[i] < overflowEventSequence[oldestIndex])) {
            oldestIndex = i;
        }
    }
    if (oldestIndex != static_cast<uint8_t>(EventType::Count)) {
        event = overflowEvents[oldestIndex];
        hasOverflowEvent[oldestIndex] = false;
        found = true;
    }
    portEXIT_CRITICAL(&overflowEventsMux);
    return found;
}

void SupervisionFlow::processEvents(bool stopWhenWebStart) {
    if (eventQueue == nullptr) return;
    Event event = {};
    while (xQueueReceive(eventQueue, &event, 0) == pdPASS) {
        processEvent(event);
        if (stopWhenWebStart && event.type == EventType::WebStart) return;
    }
    while (takeOverflowEvent(event)) {
        processEvent(event);
        if (stopWhenWebStart && event.type == EventType::WebStart) return;
    }
}

void SupervisionFlow::processEvent(const Event &event) {
    switch (event.type) {
    case EventType::Cancel:
        if (phase != Phase::Idle) publishTerminalEvent(TerminalEvent::Cancelled);
        break;
    case EventType::CardDetected:
        if (phase == Phase::WaitingForCard) {
            cardUidLength = event.cardUidLength;
            memcpy(cardUid, event.cardUid, cardUidLength);
            cardDetected = true;
        }
        break;
    case EventType::RequestResult:
        if (phase == Phase::Idle || phase == Phase::Success || webInitiated) break;
        if (!event.success) {
            strlcpy(errorMessage, strcmp(event.error, "NO_SUPERVISORS_AVAILABLE") == 0
                                        ? "Keine Aufsicht verfuegbar"
                                        : translateReaderError(event.error).c_str(), sizeof(errorMessage));
            publishTerminalEvent(TerminalEvent::Failed);
            break;
        }
        strlcpy(hintMessage, "Aufsichts-Karte auflegen oder per\nApp/Web bestaetigen", sizeof(hintMessage));
        for (uint8_t i = 0; i < event.supervisorCount; ++i) {
            strlcat(hintMessage, i == 0 ? "\n" : ", ", sizeof(hintMessage));
            strlcat(hintMessage, event.supervisorNames[i], sizeof(hintMessage));
        }
        hintReady = true;
        break;
    case EventType::CardAuthentication:
        if (phase != Phase::RequestedAuth) break;
        if (event.error[0] != '\0' || event.keyLen != 16) {
            strlcpy(errorMessage, strcmp(event.error, "SUPERVISOR_NOT_AUTHORIZED") == 0
                                        ? "Karte nicht als Aufsicht\nberechtigt"
                                        : translateReaderError(event.error).c_str(), sizeof(errorMessage));
            cardRejected = true;
            break;
        }
        keyNo = event.keyNo;
        memcpy(keyBytes, event.keyBytes, sizeof(keyBytes));
        keyReady = true;
        break;
    case EventType::Resolved:
        if (phase == Phase::Idle || phase == Phase::Success) break;
        if (event.success) {
            publishTerminalEvent(TerminalEvent::Resolved);
        } else {
            strlcpy(errorMessage, event.error[0] != '\0' ? translateReaderError(event.error).c_str()
                                                          : "Aufsicht abgelehnt", sizeof(errorMessage));
            publishTerminalEvent(TerminalEvent::Failed);
        }
        break;
    case EventType::WebStart:
        strlcpy(armedRequesterName, event.requesterName, sizeof(armedRequesterName));
        armedResourceId = event.resourceId;
        requestedAtMs = event.receivedAtMs;
        requestedTimeoutMs = event.timeoutMs > 0 ? event.timeoutMs : TIMEOUT_MS;
        pendingWebStart = true;
        break;
    case EventType::Count:
        break;
    }
}

void SupervisionFlow::showError(bool terminal, uint32_t now) {
    beeper.errorBeep();
    phase = Phase::Error;
    errorIsTerminal = terminal;
    phaseChangedAtMs = now;
    renderScreen(SupervisionScreen::STATUS_ERROR);
}

void SupervisionFlow::renderScreen(SupervisionScreen::Status status) {
    SupervisionScreen::View view;
    view.deadlineMs = activeDeadlineMs;
    view.requesterName = requesterName;
    view.statusMessage = errorMessage;
    view.supervisorHint = hintMessage;
    view.status = status;
    screen.render(view);
}

SupervisionFlow::Outcome SupervisionFlow::tick(uint32_t now) {
    processEvents();
    TerminalEvent event = terminalEvent;
    if (event == TerminalEvent::Cancelled) {
        terminalEvent = TerminalEvent::None;
        logger.debug("Supervision cancelled by user");
        api.cancelSupervision(); resetActiveTransaction(); return Outcome::ReturnToRouting;
    }
    if (hintReady) { hintReady = false; renderScreen(SupervisionScreen::STATUS_WAITING); }
    if (event == TerminalEvent::Resolved) {
        // The server resolution settles the transaction. Discard card-path
        // events that raced it so a subsequent tick cannot replace success.
        terminalEvent = TerminalEvent::None;
        cardRejected = keyReady = cardDetected = false;
        beeper.successBeep(); nfc.disableCardDetection();
        phase = Phase::Success; phaseChangedAtMs = now; renderScreen(SupervisionScreen::STATUS_SUCCESS); return Outcome::None;
    }
    if (event == TerminalEvent::Failed) {
        terminalEvent = TerminalEvent::None;
        showError(true, now);
        return Outcome::None;
    }
    if (cardRejected) { cardRejected = false; showError(false, now); return Outcome::None; }
    if (phase != Phase::Success && static_cast<int32_t>(now - activeDeadlineMs) > 0) {
        logger.error("Supervision timeout reached"); api.cancelSupervision(); resetActiveTransaction(); return Outcome::ReturnToRouting;
    }
    switch (phase) {
    case Phase::WaitingForCard:
        if (cardDetected) { cardDetected = false; nfc.disableCardDetection(); api.requestSupervisorCardAuthenticationData(cardUid, cardUidLength, resourceId); phase = Phase::RequestedAuth; phaseChangedAtMs = now; }
        break;
    case Phase::RequestedAuth:
        if (keyReady) {
            keyReady = false; renderScreen(SupervisionScreen::STATUS_VERIFYING);
            if (nfc.authenticate(keyNo, keyBytes)) {
                beeper.successBeep();
                if (webInitiated) { api.confirmSupervisorCardAuth(resourceId); phase = Phase::Starting; phaseChangedAtMs = now; }
                else { resetActiveTransaction(); return Outcome::UnlockAndStartSession; }
            } else { strlcpy(errorMessage, "Karte konnte nicht\ngelesen werden", sizeof(errorMessage)); showError(false, now); }
        }
        break;
    case Phase::Success:
        if (now - phaseChangedAtMs > SUCCESS_DWELL_MS) { bool unlock = !webInitiated; resetActiveTransaction(); return unlock ? Outcome::Unlock : Outcome::ReturnToRouting; }
        break;
    case Phase::Error:
        if (now - phaseChangedAtMs > ERROR_DWELL_MS) {
            if (errorIsTerminal) { resetActiveTransaction(); return Outcome::ReturnToRouting; }
            phase = Phase::WaitingForCard; cardDetected = false; nfc.resetCardPresence(); nfc.enableCardDetection(); renderScreen(SupervisionScreen::STATUS_WAITING);
        }
        break;
    default: break;
    }
    return Outcome::None;
}
#endif
