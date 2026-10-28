#pragma once

#include <cstdint>
#include <string>

// Mass introduction (ATT-1151). An introducer arms this reader from the web UI; every cardholder
// who taps here is introduced to the session's resource or group. Each card is crypto-verified like
// a supervisor card: UID lookup, key handed out, reader authenticates, reader confirms.
struct ApiMassIntroduction
{
    // MASS_INTRODUCTION_START: shows the scan screen until END, cancel or local expiry.
    struct MassIntroductionStartCommand
    {
        std::string sessionId;
        std::string targetName;
        std::string introducerUsername;
        uint32_t remainingMs = 0;
    };

    // MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA: the tapped card's key, or why it was rejected.
    struct MassIntroductionCardAuthenticationResponse
    {
        std::string sessionId;
        uint8_t keyNo = 0;
        uint8_t keyBytes[16] = {0};
        uint8_t keyLen = 0;
        std::string username;
        std::string error;
    };

    // MASS_INTRODUCTION_RESULT: outcome for the card confirmed last.
    struct MassIntroductionResult
    {
        std::string sessionId;
        bool success = false;
        std::string username;
        bool alreadyIntroduced = false;
        uint32_t participantCount = 0;
        std::string error;
    };

    // MASS_INTRODUCTION_END: reason is 'expired', 'cancelled' or 'revoked'.
    struct MassIntroductionEnd
    {
        std::string sessionId;
        std::string reason;
    };
};
