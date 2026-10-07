#include "supervision.hpp"

#ifdef HAS_LVGL_DISPLAY
#ifndef SUPERVISION_FLOW_TEST
#include "platform.hpp"
#include "../display/display.hpp"
#endif

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
        if (phase != Phase::Idle && phase != Phase::Success &&
            !(phase == Phase::Error && errorIsTerminal)) {
            publishTerminalEvent(TerminalEvent::Cancelled);
        }
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
                                        ? "Keine Aufsicht verfügbar"
                                        : translateReaderError(event.error).c_str(), sizeof(errorMessage));
            publishTerminalEvent(TerminalEvent::Failed);
            break;
        }
        strlcpy(hintMessage, "Aufsichts-Karte auflegen oder per\nApp/Web bestätigen", sizeof(hintMessage));
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
        if (phase == Phase::Idle || phase == Phase::Success ||
            (phase == Phase::Error && errorIsTerminal)) break;
        if (event.success) {
            publishTerminalEvent(TerminalEvent::Resolved);
        } else {
            strlcpy(errorMessage, event.error[0] != '\0' ? translateReaderError(event.error).c_str()
                                                          : "Aufsicht abgelehnt", sizeof(errorMessage));
            publishTerminalEvent(TerminalEvent::Failed);
        }
        break;
    case EventType::WebStart:
        if (phase != Phase::Idle || pendingWebStart) {
            logger.debug("Ignoring duplicate supervision start");
            break;
        }
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

#endif
