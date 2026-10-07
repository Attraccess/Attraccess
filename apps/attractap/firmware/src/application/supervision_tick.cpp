#include "supervision.hpp"

#ifdef HAS_LVGL_DISPLAY
#ifndef SUPERVISION_FLOW_TEST
#include "platform.hpp"
#include "../display/display.hpp"
#endif

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
    if (hintReady) {
        hintReady = false;
        const auto status = phase == Phase::Error      ? SupervisionScreen::STATUS_ERROR
                            : phase == Phase::Success  ? SupervisionScreen::STATUS_SUCCESS
                            : phase == Phase::Starting ? SupervisionScreen::STATUS_VERIFYING
                                                       : SupervisionScreen::STATUS_WAITING;
        renderScreen(status);
    }
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
        cardRejected = keyReady = cardDetected = false;
        showError(true, now);
        return Outcome::None;
    }
    if (cardRejected) { cardRejected = false; showError(false, now); return Outcome::None; }
    if (phase != Phase::Idle && phase != Phase::Success &&
        static_cast<int32_t>(now - activeDeadlineMs) > 0) {
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
