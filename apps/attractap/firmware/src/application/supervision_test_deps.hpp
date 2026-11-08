#pragma once

// Host-test doubles for the concrete device collaborators. Production builds
// never include this header; it keeps flow tests deterministic and hardware-free.
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <string>
#include "../display/messages.hpp"

inline size_t strlcpy(char *destination, const char *source, size_t size) {
    const size_t length = std::strlen(source);
    if (size != 0) {
        const size_t copyLength = length < size - 1 ? length : size - 1;
        std::memcpy(destination, source, copyLength);
        destination[copyLength] = '\0';
    }
    return length;
}

inline size_t strlcat(char *destination, const char *source, size_t size) {
    const size_t destinationLength = std::strlen(destination);
    if (destinationLength >= size) return destinationLength + std::strlen(source);
    return destinationLength + strlcpy(destination + destinationLength, source, size - destinationLength);
}

inline uint32_t supervisionTestNowMs = 0;
inline uint32_t millis() { return supervisionTestNowMs; }
inline std::string translateReaderError(const std::string &error) { return error; }

class API {
public:
    static constexpr size_t MAX_INTRODUCERS = 8;
    static constexpr size_t MAX_USERNAME_LEN = 33;
    struct SupervisionRequestResult {
        bool success = false;
        std::string error;
        uint8_t supervisorCount = 0;
        std::string supervisorNames[MAX_INTRODUCERS];
    };
    struct SupervisorCardAuthenticationResponse {
        std::string error;
    };
    struct SupervisionResolvedResult {
        bool success = false;
        std::string error;
    };
    struct SupervisionStartCommand {
        uint32_t resourceId = 0;
        uint32_t timeoutMs = 0;
        std::string requesterUsername;
    };

    uint32_t requests = 0;
    uint32_t cancels = 0;
    uint32_t cardAuthRequests = 0;
    uint32_t lastCardAuthResourceId = 0;
    std::string lastCardPurpose;
    void requestSupervision(uint32_t) { ++requests; }
    void sendCardDetected(const char *purpose, const uint8_t *, uint8_t, uint32_t resourceId = 0, const char * = nullptr) {
        ++cardAuthRequests;
        lastCardPurpose = purpose;
        lastCardAuthResourceId = resourceId;
    }
    void cancelSupervision() { ++cancels; }
};

class NFC : public INfc {
public:
    uint32_t enabled = 0;
    uint32_t disabled = 0;
    void setup() override {}
    void loop() override {}
    void resetCardPresence() override {}
    void enableCardDetection() override { ++enabled; }
    void disableCardDetection() override { ++disabled; }
    bool suspend() override { ++disabled; return true; }
    void setCardDetectionCallback(std::function<void(uint8_t *, uint8_t)>) override {}
    void setCardRemovalCallback(std::function<void(uint32_t)>) override {}
    bool isCardPresent() override { return false; }
    bool transceive(const uint8_t *, uint8_t, uint8_t *, uint8_t *) override { return false; }
    void setConversationActive(bool) override {}
};

class Beeper {
public:
    uint32_t errors = 0;
    uint32_t successes = 0;
    void errorBeep() { ++errors; }
    void successBeep() { ++successes; }
};

class Logger {
public:
    void error(const char *) {}
    void debug(const char *) {}
};

class SupervisionScreen {
public:
    enum Status { STATUS_WAITING, STATUS_VERIFYING, STATUS_SUCCESS, STATUS_ERROR };
    struct View {
        uint32_t deadlineMs = 0;
        std::string requesterName;
        FirmwareI18n::Text statusMessage;
        FirmwareI18n::Text supervisorHint;
        Status status = STATUS_WAITING;
    };
    View lastView;
    void render(const View &view) { lastView = view; }
    void armCancelGuard() {}
};

class Display {
public:
    static void transitionToScreen(SupervisionScreen *) {}
};
