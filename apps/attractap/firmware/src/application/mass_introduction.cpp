// Mass introduction (ATT-1151): reader-side session state machine
// FEATURE: application-mass-introduction

#include "mass_introduction.hpp"

#ifdef HAS_LVGL_DISPLAY
#include "../platform.hpp"
#include "../display/display.hpp"
#include <cstring>
#include <string>

namespace {
// Server-supplied names may be cut to fit the event; never leave half a UTF-8 character behind.
void copyText(char *destination, const std::string &source, size_t size) {
    strlcpy(destination, source.c_str(), size);
    if (source.size() < size) return;
    size_t start = strlen(destination);
    while (start > 0 && (static_cast<unsigned char>(destination[start - 1]) & 0xC0) == 0x80) --start;
    if (start == 0) return;
    const unsigned char lead = static_cast<unsigned char>(destination[start - 1]);
    const size_t needed = lead >= 0xF0 ? 4 : lead >= 0xE0 ? 3 : lead >= 0xC0 ? 2 : 1;
    if (strlen(destination) - (start - 1) < needed) destination[start - 1] = '\0';
}
}

MassIntroductionFlow::MassIntroductionFlow(API &api, INfc &nfc, Beeper &beeper, Logger &logger,
                                           MassIntroductionScreen &screen)
    : api(api), nfc(nfc), beeper(beeper), logger(logger), screen(screen) {}

// --- Producers (any task) ------------------------------------------------------------------

void MassIntroductionFlow::onStart(const API::MassIntroductionStartCommand &command) {
    Event event = {};
    event.type = EventType::Start;
    event.remainingMs = command.remainingMs;
    event.receivedAtMs = millis();
    copyText(event.sessionId, command.sessionId, sizeof(event.sessionId));
    copyText(event.name, command.targetName, sizeof(event.name));
    copyText(event.introducer, command.introducerUsername, sizeof(event.introducer));
    enqueue(event);
}

void MassIntroductionFlow::onCardAuthentication(const API::MassIntroductionCardAuthenticationResponse &response) {
    Event event = {};
    event.type = EventType::CardAuthentication;
    event.keyNo = response.keyNo;
    event.keyLen = response.keyLen;
    memcpy(event.keyBytes, response.keyBytes, sizeof(event.keyBytes));
    copyText(event.sessionId, response.sessionId, sizeof(event.sessionId));
    copyText(event.name, response.username, sizeof(event.name));
    copyText(event.code, response.error, sizeof(event.code));
    enqueue(event);
}

void MassIntroductionFlow::onResult(const API::MassIntroductionResult &result) {
    Event event = {};
    event.type = EventType::Result;
    event.success = result.success;
    event.alreadyIntroduced = result.alreadyIntroduced;
    event.participantCount = result.participantCount;
    copyText(event.sessionId, result.sessionId, sizeof(event.sessionId));
    copyText(event.name, result.username, sizeof(event.name));
    copyText(event.code, result.error, sizeof(event.code));
    enqueue(event);
}

void MassIntroductionFlow::onEnd(const API::MassIntroductionEnd &end) {
    Event event = {};
    event.type = EventType::End;
    copyText(event.sessionId, end.sessionId, sizeof(event.sessionId));
    copyText(event.code, end.reason.empty() ? std::string("unknown") : end.reason, sizeof(event.code));
    enqueue(event);
}

void MassIntroductionFlow::onCardDetected(const uint8_t *uid, uint8_t uidLength) {
    Event event = {};
    event.type = EventType::CardDetected;
    event.uidLength = uidLength > sizeof(event.uid) ? sizeof(event.uid) : uidLength;
    memcpy(event.uid, uid, event.uidLength);
    enqueue(event);
}

void MassIntroductionFlow::requestCancel() {
    Event event = {};
    event.type = EventType::Cancel;
    enqueue(event);
}

void MassIntroductionFlow::enqueue(const Event &event) {
    bool queued = false;
    portENTER_CRITICAL(&queueMux);
    if (queueCount < QUEUE_CAPACITY) {
        queue[(queueHead + queueCount) % QUEUE_CAPACITY] = event;
        ++queueCount;
        queued = true;
    }
    portEXIT_CRITICAL(&queueMux);
    // Never wait here: the websocket task must keep draining. A lost reply is recovered by the
    // per-card response timeout, a lost end by the local countdown.
    if (!queued) logger.error("Mass introduction event queue full; dropping event");
}

bool MassIntroductionFlow::dequeue(Event &event) {
    bool found = false;
    portENTER_CRITICAL(&queueMux);
    if (queueCount > 0) {
        event = queue[queueHead];
        queueHead = (queueHead + 1) % QUEUE_CAPACITY;
        --queueCount;
        found = true;
    }
    portEXIT_CRITICAL(&queueMux);
    return found;
}

// --- Main loop -----------------------------------------------------------------------------

bool MassIntroductionFlow::takePendingStart(uint32_t now, bool readerBusy) {
    processEvents(now);
    if (!pendingStart) return false;
    if (readerBusy) {
        refuse(pendingSessionId, "busy");
        clearPendingStart();
        return false;
    }
    if (now - pendingReceivedAtMs >= pendingRemainingMs) {
        refuse(pendingSessionId, "expired");
        clearPendingStart();
        return false;
    }
    enter(now);
    clearPendingStart();
    return true;
}

MassIntroductionFlow::Outcome MassIntroductionFlow::tick(uint32_t now) {
    processEvents(now);
    if (leftFlow || phase == Phase::Idle) {
        leftFlow = false;
        return Outcome::ReturnToRouting;
    }
    if (static_cast<int32_t>(now - deadlineMs) >= 0) {
        // The server expires the session at the same moment; the cancel only keeps it consistent
        // if this clock ran slightly ahead.
        leave("timeout", true);
        return Outcome::ReturnToRouting;
    }

    switch (phase) {
    case Phase::WaitingForCard:
    case Phase::ShowingResult:
        if (cardDetected) {
            cardDetected = false;
            const bool repeated = cardUidLength == lastCardUidLength &&
                                  memcmp(cardUid, lastCardUid, cardUidLength) == 0 &&
                                  now - lastCardHandledAtMs < REPEAT_GUARD_MS;
            if (repeated) {
                logger.debug("MassIntroduction: ignoring repeated card");
            } else {
                beginCard(now);
                break;
            }
        }
        // A result stays readable for a moment; the next card may cut it short.
        if (phase == Phase::ShowingResult && now - phaseChangedAtMs >= RESULT_DWELL_MS) {
            phase = Phase::WaitingForCard;
            phaseChangedAtMs = now;
            statusMessage.clear();
            render(MassIntroductionScreen::STATUS_WAITING);
        }
        break;
    case Phase::RequestedAuth:
    case Phase::AwaitingResult:
        if (now - phaseChangedAtMs > RESPONSE_TIMEOUT_MS) {
            logger.error("MassIntroduction: no server response for card");
            showResult(MassIntroductionScreen::STATUS_ERROR, FirmwareI18n::Message::MassIntroductionNoResponse, now);
        }
        break;
    case Phase::Idle:
        break;
    }
    return Outcome::None;
}

void MassIntroductionFlow::preempt(uint32_t now) {
    processEvents(now);
    if (pendingStart) {
        refuse(pendingSessionId, "firmware-update");
        clearPendingStart();
    }
    if (active()) leave("firmware-update", true);
    leftFlow = false;
}

void MassIntroductionFlow::onDisconnect() {
    portENTER_CRITICAL(&queueMux);
    queueHead = queueCount = 0;
    portEXIT_CRITICAL(&queueMux);
    clearPendingStart();
    if (active()) leave("disconnected", false);
    leftFlow = false;
}

void MassIntroductionFlow::processEvents(uint32_t now) {
    Event event = {};
    while (dequeue(event)) processEvent(event, now);
}

bool MassIntroductionFlow::isActiveSession(const char *id) const {
    return phase != Phase::Idle && strcmp(id, sessionId) == 0;
}

void MassIntroductionFlow::processEvent(const Event &event, uint32_t now) {
    switch (event.type) {
    case EventType::Start:
        handleStart(event);
        break;
    case EventType::CardDetected:
        if (phase == Phase::WaitingForCard || phase == Phase::ShowingResult) {
            cardUidLength = event.uidLength;
            memcpy(cardUid, event.uid, cardUidLength);
            cardDetected = true;
        }
        break;
    case EventType::CardAuthentication:
        if (phase == Phase::RequestedAuth && isActiveSession(event.sessionId)) handleCardAuthentication(event, now);
        break;
    case EventType::Result:
        if (phase == Phase::AwaitingResult && isActiveSession(event.sessionId)) handleResult(event, now);
        break;
    case EventType::End:
        if (pendingStart && strcmp(event.sessionId, pendingSessionId) == 0) {
            logger.infof("MassIntroduction: ended reason=%s session=%s before it was shown", event.code, event.sessionId);
            clearPendingStart();
        } else if (isActiveSession(event.sessionId)) {
            leave(event.code, false);
        }
        break;
    case EventType::Cancel:
        if (active()) leave("reader-cancel", true);
        break;
    }
}

void MassIntroductionFlow::handleStart(const Event &event) {
    if (event.sessionId[0] == '\0') {
        logger.error("MassIntroduction: ignoring start without session id");
        return;
    }
    if (isActiveSession(event.sessionId) ||
        (pendingStart && strcmp(event.sessionId, pendingSessionId) == 0)) {
        logger.debug("MassIntroduction: ignoring duplicate start");
        return;
    }
    if (active()) {
        refuse(event.sessionId, "busy");
        return;
    }
    if (event.remainingMs == 0) {
        refuse(event.sessionId, "expired");
        return;
    }
    // The server is authoritative: a newer arm replaces one this reader has not shown yet.
    if (pendingStart) refuse(pendingSessionId, "superseded");
    pendingStart = true;
    strlcpy(pendingSessionId, event.sessionId, sizeof(pendingSessionId));
    strlcpy(pendingTargetName, event.name, sizeof(pendingTargetName));
    strlcpy(pendingIntroducer, event.introducer, sizeof(pendingIntroducer));
    pendingReceivedAtMs = event.receivedAtMs;
    pendingRemainingMs = event.remainingMs;
}

void MassIntroductionFlow::handleCardAuthentication(const Event &event, uint32_t now) {
    if (event.code[0] != '\0' || event.keyLen != 16) {
        logger.infof("MassIntroduction: card rejected error=%s", event.code);
        showResult(MassIntroductionScreen::STATUS_ERROR, FirmwareI18n::readerError(event.code), now);
        return;
    }
    strlcpy(participantName, event.name, sizeof(participantName));
    uint8_t key[16];
    memcpy(key, event.keyBytes, sizeof(key));
    const bool authenticated = nfc.authenticate(event.keyNo, key);
    memset(key, 0, sizeof(key));
    if (!authenticated) {
        // Stay in the session; the person can simply tap again.
        logger.error("MassIntroduction: card authentication failed");
        showResult(MassIntroductionScreen::STATUS_ERROR, FirmwareI18n::Message::CouldNotReadCard, now);
        return;
    }
    api.confirmMassIntroductionCardAuth(sessionId, cardUid, cardUidLength);
    phase = Phase::AwaitingResult;
    phaseChangedAtMs = now;
}

void MassIntroductionFlow::handleResult(const Event &event, uint32_t now) {
    if (!event.success) {
        logger.infof("MassIntroduction: card rejected error=%s", event.code);
        showResult(MassIntroductionScreen::STATUS_ERROR,
                   event.code[0] != '\0' ? FirmwareI18n::readerError(event.code)
                                         : FirmwareI18n::Text(FirmwareI18n::Message::ErrorMassIntroductionFailed),
                   now);
        return;
    }
    if (event.name[0] != '\0') strlcpy(participantName, event.name, sizeof(participantName));
    participantCount = event.participantCount;
    memcpy(lastCardUid, cardUid, cardUidLength);
    lastCardUidLength = cardUidLength;
    lastCardHandledAtMs = now;
    logger.infof("MassIntroduction: introduced user=%s already=%d count=%u", participantName,
                 event.alreadyIntroduced ? 1 : 0, static_cast<unsigned>(participantCount));
    showResult(event.alreadyIntroduced ? MassIntroductionScreen::STATUS_ALREADY_INTRODUCED
                                       : MassIntroductionScreen::STATUS_INTRODUCED,
               FirmwareI18n::Text(), now);
}

void MassIntroductionFlow::refuse(const char *id, const char *reason) {
    logger.infof("MassIntroduction: refused session=%s reason=%s", id, reason);
    api.cancelMassIntroduction(id);
}

void MassIntroductionFlow::clearPendingStart() {
    pendingStart = false;
    pendingSessionId[0] = pendingTargetName[0] = pendingIntroducer[0] = '\0';
    pendingReceivedAtMs = pendingRemainingMs = 0;
}

void MassIntroductionFlow::enter(uint32_t now) {
    strlcpy(sessionId, pendingSessionId, sizeof(sessionId));
    strlcpy(targetName, pendingTargetName, sizeof(targetName));
    strlcpy(introducerName, pendingIntroducer, sizeof(introducerName));
    // Count from arrival, so time spent waiting for the main loop is not added on top.
    durationMs = pendingRemainingMs;
    deadlineMs = pendingReceivedAtMs + pendingRemainingMs;
    participantCount = 0;
    participantName[0] = '\0';
    cardDetected = false;
    lastCardUidLength = 0;
    statusMessage.clear();
    phase = Phase::WaitingForCard;
    phaseChangedAtMs = now;
    leftFlow = false;
    logger.infof("MassIntroduction: started session=%s remainingMs=%u", sessionId,
                 static_cast<unsigned>(deadlineMs - now));
    render(MassIntroductionScreen::STATUS_WAITING);
    screen.armCancelGuard();
    Display::transitionToScreen(&screen);
    // No presence reset: a card already lying on the reader must be tapped deliberately.
    nfc.enableCardDetection();
}

void MassIntroductionFlow::leave(const char *reason, bool notifyServer) {
    logger.infof("MassIntroduction: ended reason=%s session=%s introduced=%u", reason, sessionId,
                 static_cast<unsigned>(participantCount));
    if (notifyServer) api.cancelMassIntroduction(sessionId);
    phase = Phase::Idle;
    leftFlow = true;
    cardDetected = false;
    sessionId[0] = targetName[0] = introducerName[0] = participantName[0] = '\0';
    statusMessage.clear();
}

void MassIntroductionFlow::beginCard(uint32_t now) {
    logger.infof("MassIntroduction: card uid=%s", hexToString(cardUid, cardUidLength).c_str());
    nfc.disableCardDetection();
    api.requestMassIntroductionCardAuthenticationData(sessionId, cardUid, cardUidLength);
    phase = Phase::RequestedAuth;
    phaseChangedAtMs = now;
    participantName[0] = '\0';
    statusMessage.clear();
    render(MassIntroductionScreen::STATUS_VERIFYING);
}

void MassIntroductionFlow::showResult(MassIntroductionScreen::Status result, const FirmwareI18n::Text &message,
                                      uint32_t now) {
    if (result == MassIntroductionScreen::STATUS_ERROR) beeper.errorBeep();
    else beeper.successBeep();
    phase = Phase::ShowingResult;
    phaseChangedAtMs = now;
    statusMessage = message;
    render(result);
    // Presence is not reset: the card still lying on the reader is not read again until it is
    // lifted, while the next person's card is picked up straight away.
    nfc.enableCardDetection();
}

void MassIntroductionFlow::render(MassIntroductionScreen::Status status) {
    MassIntroductionScreen::View view;
    view.deadlineMs = deadlineMs;
    view.durationMs = durationMs;
    view.targetName = targetName;
    view.introducerName = introducerName;
    view.participantName = participantName;
    view.participantCount = participantCount;
    view.statusMessage = statusMessage;
    view.status = status;
    screen.render(view);
}

#endif
