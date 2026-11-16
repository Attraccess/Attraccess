// Thread-safe global device state guarded by a FreeRTOS mutex
// FEATURE: Cross-task state synchronization for network and API status


#include "state.hpp"
#include "language.hpp"
#include "../platform.hpp"
#include <string>


#include "state_lock.hpp"

SemaphoreHandle_t State::state_mutex = xSemaphoreCreateRecursiveMutex();

esp_ip4_addr_t State::wifi_ip = {};
bool State::wifi_connected = false;
std::string State::wifi_ssid = "";
esp_ip4_addr_t State::ethernet_ip = {};
bool State::ethernet_connected = false;
std::string State::websocket_hostname = "";
State::NetworkQualityState State::network_quality_state = {};
uint16_t State::websocket_port = 0;
bool State::websocket_use_ssl = false;
bool State::websocket_connected = false;
State::WebsocketPhase State::websocket_phase = State::WS_INIT;
std::string State::websocket_cert_name = "";
int State::websocket_cert_index = 0;
int State::websocket_cert_count = 0;
int State::websocket_remembered_retry_count = 0;
bool State::websocket_cert_locked = false;
int State::websocket_next_attempt_seconds = 0;
bool State::enrollment_pending = false;
bool State::enrollment_lite = false;
bool State::enrollment_disconnected = false;
std::string State::enrollment_code = "";
std::string State::enrollment_app_url = "";
bool State::enrollment_has_pattern = false;
uint8_t State::enrollment_pattern[State::ENROLLMENT_PATTERN_LENGTH] = {};
uint32_t State::enrollment_received_at = 0;
uint32_t State::enrollment_rotates_in_ms = 0;
uint32_t State::enrollment_expires_in_ms = 0;
uint8_t State::enrollment_outcome = State::ENROLLMENT_OUTCOME_NONE;
uint8_t State::enrollment_outcome_unconsumed = State::ENROLLMENT_OUTCOME_NONE;
bool State::pairing_removed = false;
State::SessionProblem State::session_problem = State::SESSION_PROBLEM_NONE;
bool State::session_problem_notice = false;
uint32_t State::pairing_removed_at = 0;
bool State::api_authenticated = false;
std::string State::api_device_name = "";
static Language::Session language_session;


void State::setWebsocketState(bool connected, std::string hostname, uint16_t port, bool useSSL)
{
    StateLock lock(state_mutex);
    websocket_connected = connected;
    websocket_hostname = hostname;
    websocket_port = port;
    websocket_use_ssl = useSSL;
}

void State::setWebsocketPhase(WebsocketPhase phase)
{
    StateLock lock(state_mutex);
    websocket_phase = phase;
}

void State::setWebsocketCertProgress(std::string certName, int certIndex, int certCount, int rememberedRetryCount, bool certLocked)
{
    StateLock lock(state_mutex);
    websocket_cert_name = certName;
    websocket_cert_index = certIndex;
    websocket_cert_count = certCount;
    websocket_remembered_retry_count = rememberedRetryCount;
    websocket_cert_locked = certLocked;
}

void State::setWebsocketNextAttemptSeconds(int seconds)
{
    StateLock lock(state_mutex);
    websocket_next_attempt_seconds = seconds;
}

State::WebsocketState State::getWebsocketState()
{
    StateLock lock(state_mutex);
    WebsocketState state;
    state.connected = websocket_connected;
    state.hostname = websocket_hostname;
    state.port = websocket_port;
    state.useSSL = websocket_use_ssl;
    state.phase = websocket_phase;
    state.certName = websocket_cert_name;
    state.certIndex = websocket_cert_index;
    state.certCount = websocket_cert_count;
    state.rememberedRetryCount = websocket_remembered_retry_count;
    state.certLocked = websocket_cert_locked;
    state.secondsUntilNextAttempt = websocket_next_attempt_seconds;

    return state;
}

void State::setApiState(bool authenticated, std::string deviceName, std::string defaultLanguage)
{
    StateLock lock(state_mutex);
    api_authenticated = authenticated;
    api_device_name = deviceName;
    // An empty value means a connectivity transition. Keep the last server
    // setting for offline and unauthenticated screens.
    language_session.setApi(authenticated, defaultLanguage);
}

State::ApiState State::getApiState()
{
    StateLock lock(state_mutex);
    ApiState state;
    state.authenticated = api_authenticated;
    state.deviceName = api_device_name;
    state.defaultLanguage = language_session.defaultLanguage;
    state.userLanguage = language_session.userLanguage;
    state.userAuthenticated = language_session.userAuthenticated;

    return state;
}

void State::setEnrollmentRound(const std::string &code, const std::string &appUrl, const uint8_t *pattern,
                               uint32_t rotatesInMs, uint32_t expiresInMs)
{
    StateLock lock(state_mutex);
    enrollment_pending = true;
    enrollment_disconnected = false;
    enrollment_code = code;
    enrollment_app_url = appUrl;
    enrollment_has_pattern = pattern != nullptr;
    for (uint8_t i = 0; pattern != nullptr && i < ENROLLMENT_PATTERN_LENGTH; i++)
    {
        enrollment_pattern[i] = pattern[i];
        if (pattern[i] >= ENROLLMENT_COLOR_COUNT)
        {
            enrollment_has_pattern = false;
        }
    }
    enrollment_received_at = millis();
    enrollment_rotates_in_ms = rotatesInMs;
    enrollment_expires_in_ms = expiresInMs;
    enrollment_outcome = ENROLLMENT_OUTCOME_NONE;
}

void State::setEnrollmentKind(bool lite)
{
    StateLock lock(state_mutex);
    enrollment_lite = lite;
}

void State::setEnrollmentRequested(bool lite)
{
    StateLock lock(state_mutex);
    enrollment_lite = lite;
    enrollment_pending = true;
    enrollment_code = "";
    enrollment_app_url = "";
    enrollment_has_pattern = false;
}

void State::setEnrollmentDisconnected()
{
    StateLock lock(state_mutex);
    enrollment_disconnected = true;
}

void State::setEnrollmentOutcome(bool accepted)
{
    StateLock lock(state_mutex);
    enrollment_outcome = accepted ? ENROLLMENT_OUTCOME_ACCEPTED : ENROLLMENT_OUTCOME_FAILED;
    enrollment_outcome_unconsumed = enrollment_outcome;
    if (accepted)
    {
        enrollment_pending = false;
    }
}

uint8_t State::consumeEnrollmentOutcome()
{
    StateLock lock(state_mutex);
    const uint8_t outcome = enrollment_outcome_unconsumed;
    enrollment_outcome_unconsumed = ENROLLMENT_OUTCOME_NONE;
    return outcome;
}

void State::setPairingRemoved()
{
    StateLock lock(state_mutex);
    pairing_removed = true;
    pairing_removed_at = millis();
    enrollment_pending = false;
    enrollment_code = "";
    enrollment_app_url = "";
    enrollment_has_pattern = false;
}

void State::clearEnrollment()
{
    StateLock lock(state_mutex);
    enrollment_pending = false;
    enrollment_disconnected = false;
    enrollment_code = "";
    enrollment_app_url = "";
    enrollment_has_pattern = false;
    pairing_removed = false;
    // enrollment_outcome_unconsumed survives so the LED still shows the result of the last request.
}

State::EnrollmentState State::getEnrollmentState()
{
    StateLock lock(state_mutex);
    const uint32_t elapsed = millis() - enrollment_received_at;
    EnrollmentState state{};
    state.pending = enrollment_pending;
    state.lite = enrollment_lite;
    state.code = enrollment_code;
    state.appUrl = enrollment_app_url;
    state.hasPattern = enrollment_has_pattern;
    for (uint8_t i = 0; i < ENROLLMENT_PATTERN_LENGTH; i++)
    {
        state.pattern[i] = enrollment_pattern[i];
    }
    state.rotatesInMs = enrollment_rotates_in_ms > elapsed ? enrollment_rotates_in_ms - elapsed : 0;
    state.expiresInMs = enrollment_expires_in_ms > elapsed ? enrollment_expires_in_ms - elapsed : 0;
    state.receivedAtMs = enrollment_received_at;
    state.stale = enrollment_disconnected || enrollment_code.empty() ||
                  static_cast<uint64_t>(elapsed) >= static_cast<uint64_t>(enrollment_rotates_in_ms) + ENROLLMENT_STALE_GRACE_MS;
    state.outcome = enrollment_outcome;
    // The notice stays while no new request has a code, and a few seconds after one does.
    state.pairingRemoved = pairing_removed && (!enrollment_pending || enrollment_code.empty() ||
                                               millis() - pairing_removed_at < PAIRING_REMOVED_NOTICE_MS);
    return state;
}

void State::setSessionProblem(SessionProblem problem)
{
    StateLock lock(state_mutex);
    session_problem = problem;
    if (problem != SESSION_PROBLEM_NONE)
    {
        session_problem_notice = true;
    }
}

State::SessionProblem State::getSessionProblem()
{
    StateLock lock(state_mutex);
    return session_problem;
}

bool State::consumeSessionProblemNotice()
{
    StateLock lock(state_mutex);
    const bool notice = session_problem_notice;
    session_problem_notice = false;
    return notice;
}

void State::setUserLanguage(bool authenticated, std::string language)
{
    StateLock lock(state_mutex);
    language_session.setUser(authenticated, language);
}

void State::setDefaultLanguage(std::string language)
{
    StateLock lock(state_mutex);
    language_session.setDefault(language);
}

std::string State::getActiveLanguage()
{
    StateLock lock(state_mutex);
    return language_session.active();
}

void State::setEthernetState(bool connected, esp_ip4_addr_t ip)
{
    StateLock lock(state_mutex);
    ethernet_ip = ip;
    ethernet_connected = connected;
}

void State::setWifiState(bool connected, esp_ip4_addr_t ip, std::string ssid)
{
    StateLock lock(state_mutex);
    wifi_connected = connected;
    wifi_ip = ip;
    wifi_ssid = ssid;
}

State::NetworkState State::getNetworkState()
{
    StateLock lock(state_mutex);
    NetworkState state;
    state.wifi_connected = wifi_connected;
    state.wifi_ip = wifi_ip;
    state.wifi_ssid = wifi_ssid;

    state.ethernet_connected = ethernet_connected;
    state.ethernet_ip = ethernet_ip;

    return state;
}

void State::setNetworkQualityState(const NetworkQualityState &state)
{
    StateLock lock(state_mutex);
    network_quality_state = state;
}

State::NetworkQualityState State::getNetworkQualityState()
{
    StateLock lock(state_mutex);
    return network_quality_state;
}
