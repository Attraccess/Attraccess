#pragma once

#include <cstdint>
#include <string>

// Mass introduction (ATT-1151). An introducer arms this reader from the web UI; every cardholder
// who taps here is introduced to the session's resource or group. The server verifies each card
// through the relay before it introduces the owner.
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
