// Link-time fakes: the pairing code only reports to State and Logger.
#include "fakes.hpp"

#include "logger/logger.hpp"
#include "state/state.hpp"

FakeEnrollment fakeEnrollment;

Logger::Logger(const char *loggerName) : name(loggerName) {}
void Logger::error(const char *) {}
void Logger::errorf(const char *, ...) {}

void State::setEnrollmentRound(const std::string &code, const std::string &appUrl, const uint8_t *pattern,
                               uint32_t rotatesInMs, uint32_t expiresInMs)
{
    fakeEnrollment.rounds++;
    fakeEnrollment.code = code;
    fakeEnrollment.appUrl = appUrl;
    fakeEnrollment.hasPattern = pattern != nullptr;
    for (int i = 0; pattern && i < 8; i++) fakeEnrollment.pattern[i] = pattern[i];
    fakeEnrollment.rotatesInMs = rotatesInMs;
    fakeEnrollment.expiresInMs = expiresInMs;
}
void State::setEnrollmentKind(bool lite) { fakeEnrollment.lite = lite; }
void State::setEnrollmentRequested(bool lite)
{
    fakeEnrollment.lite = lite;
    fakeEnrollment.requested++;
}
void State::setEnrollmentDisconnected() { fakeEnrollment.disconnected++; }
void State::setEnrollmentOutcome(bool accepted) { fakeEnrollment.outcome = accepted ? 1 : 2; }
