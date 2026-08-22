#include "supervision.hpp"

#ifdef HAS_LVGL_DISPLAY
#include "platform.hpp"
#include "../display/display.hpp"

SupervisionFlow::SupervisionFlow(API &api, NFC &nfc, Beeper &beeper, Logger &logger,
                                 SupervisionScreen &screen)
    : api(api), nfc(nfc), beeper(beeper), logger(logger), screen(screen) {}

void SupervisionFlow::reset() {
    phase = Phase::Idle;
    webInitiated = false;
    pendingWebStart = false;
    cardDetected = keyReady = cardRejected = false;
    terminalEvent = TerminalEvent::None;
    errorIsTerminal = hintReady = false;
    cardUidLength = 0;
    errorMessage[0] = hintMessage[0] = requesterName[0] = armedRequesterName[0] = '\0';
}

void SupervisionFlow::enter(const char *requester, const char *hint, uint32_t now) {
    phase = Phase::WaitingForCard;
    cardDetected = keyReady = cardRejected = false;
    terminalEvent = TerminalEvent::None;
    errorIsTerminal = hintReady = false;
    errorMessage[0] = '\0';
    startedAtMs = phaseChangedAtMs = now;
    strlcpy(requesterName, requester, sizeof(requesterName));
    nfc.resetCardPresence();
    nfc.enableCardDetection();
    screen.setRequesterName(requesterName);
    screen.setTimeoutTime(now + TIMEOUT_MS);
    screen.setStatus(SupervisionScreen::STATUS_WAITING);
    screen.setSupervisorHint(hint);
    screen.armCancelGuard();
    Display::transitionToScreen(&screen);
}

void SupervisionFlow::beginReaderInitiated(const std::string &requester, uint32_t id) {
    reset();
    resourceId = id;
    enter(requester.c_str(), "Aufsichts-Karte auflegen oder per\nApp/Web bestaetigen", millis());
    api.requestSupervision(resourceId);
}

void SupervisionFlow::armWebInitiated(const API::SupervisionStartCommand &command) {
    strlcpy(armedRequesterName, command.requesterUsername.c_str(), sizeof(armedRequesterName));
    armedResourceId = command.resourceId;
    requestedAtMs = millis();
    requestedTimeoutMs = command.timeoutMs > 0 ? command.timeoutMs : TIMEOUT_MS;
    pendingWebStart = true;
}

void SupervisionFlow::beginWebInitiated(const API::SupervisionStartCommand &command) {
    pendingWebStart = false;
    webInitiated = true;
    resourceId = command.resourceId;
    enter(command.requesterUsername.c_str(), "Aufsichts-Karte auflegen", millis());
}

bool SupervisionFlow::takePendingWebStart(uint32_t now, bool readerBusy) {
    if (!pendingWebStart) return false;
    pendingWebStart = false;
    if (now - requestedAtMs > requestedTimeoutMs) {
        logger.debug("Ignoring supervision arm that outlived its request");
        return false;
    }
    if (readerBusy) {
        logger.debug("Reader is in use, releasing the supervision request");
        api.cancelSupervision();
        return false;
    }
    API::SupervisionStartCommand command;
    command.resourceId = armedResourceId;
    command.timeoutMs = requestedTimeoutMs;
    command.requesterUsername = armedRequesterName;
    beginWebInitiated(command);
    return true;
}

void SupervisionFlow::onDisconnect() { reset(); }
bool SupervisionFlow::active() const { return phase != Phase::Idle; }

void SupervisionFlow::onCardDetected(const uint8_t *uid, uint8_t uidLength) {
    if (phase != Phase::WaitingForCard) return;
    cardUidLength = uidLength > sizeof(cardUid) ? sizeof(cardUid) : uidLength;
    memcpy(cardUid, uid, cardUidLength);
    cardDetected = true;
}

void SupervisionFlow::publishTerminalEvent(TerminalEvent event) {
    // Terminal outcomes are mutually exclusive. A local cancellation wins over
    // a concurrent websocket event because it represents an explicit user action.
    if (event == TerminalEvent::Cancelled || terminalEvent == TerminalEvent::None) {
        terminalEvent = event;
    }
}

void SupervisionFlow::requestCancel() { publishTerminalEvent(TerminalEvent::Cancelled); }

void SupervisionFlow::onRequestResult(const API::SupervisionRequestResult &result) {
    if (phase == Phase::Idle || phase == Phase::Success || webInitiated) return;
    if (!result.success) {
        strlcpy(errorMessage, result.error == "NO_SUPERVISORS_AVAILABLE"
                                    ? "Keine Aufsicht verfuegbar"
                                    : translateReaderError(result.error).c_str(), sizeof(errorMessage));
        publishTerminalEvent(TerminalEvent::Failed);
        return;
    }
    std::string hint = "Aufsichts-Karte auflegen oder per\nApp/Web bestaetigen";
    if (result.supervisorCount > 0) {
        hint += "\n";
        for (uint8_t i = 0; i < result.supervisorCount; ++i) {
            if (i > 0) hint += ", ";
            hint += result.supervisorNames[i];
        }
    }
    strlcpy(hintMessage, hint.c_str(), sizeof(hintMessage));
    hintReady = true;
}

void SupervisionFlow::onCardAuthentication(const API::SupervisorCardAuthenticationResponse &response) {
    if (phase != Phase::RequestedAuth) return;
    if (response.error.length() > 0 || response.keyLen != 16) {
        strlcpy(errorMessage, response.error == "SUPERVISOR_NOT_AUTHORIZED"
                                    ? "Karte nicht als Aufsicht\nberechtigt"
                                    : translateReaderError(response.error).c_str(), sizeof(errorMessage));
        cardRejected = true;
        return;
    }
    keyNo = response.keyNo;
    memcpy(keyBytes, response.keyBytes, sizeof(keyBytes));
    keyReady = true;
}

void SupervisionFlow::onResolved(const API::SupervisionResolvedResult &result) {
    if (phase == Phase::Idle || phase == Phase::Success) return;
    if (result.success) {
        publishTerminalEvent(TerminalEvent::Resolved);
        return;
    }
    strlcpy(errorMessage, result.error.length() > 0 ? translateReaderError(result.error).c_str() : "Aufsicht abgelehnt", sizeof(errorMessage));
    publishTerminalEvent(TerminalEvent::Failed);
}

void SupervisionFlow::showError(bool terminal, uint32_t now) {
    beeper.errorBeep();
    screen.setStatus(SupervisionScreen::STATUS_ERROR);
    screen.setStatusMessage(errorMessage);
    phase = Phase::Error;
    errorIsTerminal = terminal;
    phaseChangedAtMs = now;
}

SupervisionFlow::Outcome SupervisionFlow::tick(uint32_t now) {
    TerminalEvent event = terminalEvent;
    if (event == TerminalEvent::Cancelled) {
        terminalEvent = TerminalEvent::None;
        logger.debug("Supervision cancelled by user");
        api.cancelSupervision(); reset(); return Outcome::ReturnToRouting;
    }
    if (hintReady) { hintReady = false; screen.setSupervisorHint(hintMessage); }
    if (event == TerminalEvent::Resolved) {
        // The server resolution settles the transaction. Discard card-path
        // events that raced it so a subsequent tick cannot replace success.
        terminalEvent = TerminalEvent::None;
        cardRejected = keyReady = cardDetected = false;
        beeper.successBeep(); nfc.disableCardDetection();
        screen.setStatus(SupervisionScreen::STATUS_SUCCESS); phase = Phase::Success; phaseChangedAtMs = now; return Outcome::None;
    }
    if (event == TerminalEvent::Failed) {
        terminalEvent = TerminalEvent::None;
        showError(true, now);
        return Outcome::None;
    }
    if (cardRejected) { cardRejected = false; showError(false, now); return Outcome::None; }
    if (phase != Phase::Success && now - startedAtMs > TIMEOUT_MS) {
        logger.error("Supervision timeout reached"); api.cancelSupervision(); reset(); return Outcome::ReturnToRouting;
    }
    switch (phase) {
    case Phase::WaitingForCard:
        if (cardDetected) { cardDetected = false; nfc.disableCardDetection(); api.requestSupervisorCardAuthenticationData(cardUid, cardUidLength, resourceId); phase = Phase::RequestedAuth; phaseChangedAtMs = now; }
        break;
    case Phase::RequestedAuth:
        if (keyReady) {
            keyReady = false; screen.setStatus(SupervisionScreen::STATUS_VERIFYING);
            if (nfc.authenticate(keyNo, keyBytes)) {
                beeper.successBeep();
                if (webInitiated) { api.confirmSupervisorCardAuth(resourceId); phase = Phase::Starting; phaseChangedAtMs = now; }
                else { reset(); return Outcome::UnlockAndStartSession; }
            } else { strlcpy(errorMessage, "Karte konnte nicht\ngelesen werden", sizeof(errorMessage)); showError(false, now); }
        }
        break;
    case Phase::Success:
        if (now - phaseChangedAtMs > SUCCESS_DWELL_MS) { bool unlock = !webInitiated; reset(); return unlock ? Outcome::Unlock : Outcome::ReturnToRouting; }
        break;
    case Phase::Error:
        if (now - phaseChangedAtMs > ERROR_DWELL_MS) {
            if (errorIsTerminal) { reset(); return Outcome::ReturnToRouting; }
            screen.setStatus(SupervisionScreen::STATUS_WAITING); phase = Phase::WaitingForCard; cardDetected = false; nfc.resetCardPresence(); nfc.enableCardDetection();
        }
        break;
    default: break;
    }
    return Outcome::None;
}
#endif
