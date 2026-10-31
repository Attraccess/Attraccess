#pragma once

#include <esp_netif.h>
#include <ArduinoJson.h>
#include <string>
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

class State
{
public:
    static void setWifiState(bool connected, esp_ip4_addr_t ip, std::string ssid);
    static void setEthernetState(bool connected, esp_ip4_addr_t ip);
    struct NetworkState
    {
        bool wifi_connected;
        esp_ip4_addr_t wifi_ip;
        std::string wifi_ssid;
        bool ethernet_connected;
        esp_ip4_addr_t ethernet_ip;
    };
    static NetworkState getNetworkState();

    enum NetworkQuality
    {
        NETWORK_QUALITY_GOOD,
        NETWORK_QUALITY_DEGRADED,
        NETWORK_QUALITY_OFFLINE,
    };

    struct NetworkQualityState
    {
        NetworkQuality quality;
        uint32_t lastInboundAgeMs;
        uint8_t reconnectsLastMinute;
        uint8_t txQueueDepth;
        uint8_t txQueueFullEventsLastMinute;
        uint8_t sendFailuresLastMinute;
        uint8_t livenessTimeoutsLastMinute;
        uint32_t lastPongRttMs;
        uint32_t averagePongRttMs;
        int32_t pongRttTrendMs;
        uint8_t pongTimeoutsLastMinute;
        uint8_t pongProbeLossPercentLastMinute;
        uint8_t missedHeartbeatsLastMinute;
    };

    static void setNetworkQualityState(NetworkQuality quality,
                                       uint32_t lastInboundAgeMs,
                                       uint8_t reconnectsLastMinute,
                                       uint8_t txQueueDepth,
                                       uint8_t txQueueFullEventsLastMinute,
                                       uint8_t sendFailuresLastMinute,
                                       uint8_t livenessTimeoutsLastMinute,
                                       uint32_t lastPongRttMs,
                                       uint32_t averagePongRttMs,
                                       int32_t pongRttTrendMs,
                                       uint8_t pongTimeoutsLastMinute,
                                       uint8_t pongProbeLossPercentLastMinute,
                                       uint8_t missedHeartbeatsLastMinute);
    static NetworkQualityState getNetworkQualityState();

    // Connection phase of the websocket client. Mirrors Websocket::ConnectionState
    // so the connecting screen can show where the device is without depending on
    // the websocket header.
    enum WebsocketPhase
    {
        WS_INIT,
        WS_CONNECTING,
        WS_CONNECTED,
    };

    static void setWebsocketState(bool connected, std::string hostname, uint16_t port, bool useSSL);
    static void setWebsocketPhase(WebsocketPhase phase);
    // Cert sweep progress (only meaningful while connecting over SSL).
    static void setWebsocketCertProgress(std::string certName, int certIndex, int certCount, int rememberedRetryCount, bool certLocked);
    // Seconds until the next reconnect attempt (negative/zero means "now").
    static void setWebsocketNextAttemptSeconds(int seconds);
    struct WebsocketState
    {
        bool connected;
        std::string hostname;
        uint16_t port;
        bool useSSL;
        WebsocketPhase phase;
        std::string certName;
        int certIndex;
        int certCount;
        int rememberedRetryCount;
        bool certLocked;
        int secondsUntilNextAttempt;
    };
    static WebsocketState getWebsocketState();

    // Empty means no new server default was received (for example on disconnect).
    static void setApiState(bool authenticated, std::string deviceName, std::string defaultLanguage = "");
    static void setUserLanguage(bool authenticated, std::string language = "");
    static void setDefaultLanguage(std::string language);
    static std::string getActiveLanguage();
    struct ApiState
    {
        bool authenticated;
        std::string deviceName;
        std::string defaultLanguage;
        std::string userLanguage;
        bool userAuthenticated;
    };
    static ApiState getApiState();

    // Stable UART marker the lab tooling parses ("Enrollment: code=XXX-XXX"). Keep it constant.
    static constexpr const char *ENROLLMENT_LOG_MARKER = "Enrollment: code=";

    // How long past its due rotation a round may still be shown while no new round arrives. After that
    // the code is hidden / the Lite ring breathes white, so a dropped connection can not leave an old
    // code or pattern that matches someone else's pending request.
    static constexpr uint32_t ENROLLMENT_STALE_GRACE_MS = 10000;
    // How long the "Pairing removed" notice stays visible after a new request already shows its code.
    static constexpr uint32_t PAIRING_REMOVED_NOTICE_MS = 5000;
    static constexpr uint8_t ENROLLMENT_PATTERN_LENGTH = 8;
    // Colour indices of the Lite pattern: 0 red, 1 green, 2 blue, 3 yellow, 4 white, 5 magenta.
    static constexpr uint8_t ENROLLMENT_COLOR_COUNT = 6;

    enum EnrollmentOutcome : uint8_t
    {
        ENROLLMENT_OUTCOME_NONE = 0,
        ENROLLMENT_OUTCOME_ACCEPTED = 1,
        ENROLLMENT_OUTCOME_FAILED = 2,
    };

    // A new reader waits here until an admin approved its rotating code on the server (touch: code + QR,
    // Lite: colour pattern). Written by the pairing client, read by screens, LED and serial. Times are
    // relative: the reader has no synced clock while it is not paired.
    struct EnrollmentState
    {
        bool pending;                 // a pairing request is waiting for approval
        bool lite;                    // reader kind
        std::string code;             // "K7P-3Q" display form (also for Lite: serial/flasher)
        std::string appUrl;           // empty when the server sent none
        bool hasPattern;              // Lite: pattern[] is valid
        uint8_t pattern[ENROLLMENT_PATTERN_LENGTH];
        uint32_t rotatesInMs;         // remaining until the current round rotates (0 when due)
        uint32_t expiresInMs;         // remaining until the request expires
        uint32_t receivedAtMs;        // millis() when the current round arrived
        // Disconnected, or more than ENROLLMENT_STALE_GRACE_MS past the rotation without a new round: the
        // code is not trustworthy any more and must not be shown (Lite: white breathing).
        bool stale;
        uint8_t outcome;              // EnrollmentOutcome of the last request, until the next round
        // The admin removed the pairing: show "Pairing removed" instead of a code (also for a while
        // after the next request already has one).
        bool pairingRemoved;
    };
    // pattern is nullable (touch readers) and holds ENROLLMENT_PATTERN_LENGTH colour indices; values
    // >= ENROLLMENT_COLOR_COUNT make the pattern invalid (hasPattern false).
    static void setEnrollmentRound(const std::string &code, const std::string &appUrl, const uint8_t *pattern,
                                   uint32_t rotatesInMs, uint32_t expiresInMs);
    // Marks the reader kind (before the first round). Lite readers have a LED ring, touch readers a screen.
    static void setEnrollmentKind(bool lite);
    // A pairing request started: pending, without a code yet (stale until the first round).
    static void setEnrollmentRequested(bool lite);
    static void setEnrollmentDisconnected();
    static void setEnrollmentOutcome(bool accepted);
    // Returns the outcome set by setEnrollmentOutcome once (then NONE), so the LED can flash exactly once.
    static uint8_t consumeEnrollmentOutcome();
    static void setPairingRemoved();
    static void clearEnrollment();
    static EnrollmentState getEnrollmentState();

    // Why a paired reader's secure session does not come up; shown on the connecting screen (touch)
    // and as a red flash (Lite). Cleared when a session opens or the reader changes channel.
    enum SessionProblem : uint8_t
    {
        SESSION_PROBLEM_NONE = 0,
        // The server could not prove it is the paired installation (TLS against the pinned CA failed).
        SESSION_PROBLEM_SERVER_UNTRUSTED = 1,
        // Repeated handshake failures or timeouts, e.g. a proxy that strips Sec-WebSocket-Protocol.
        SESSION_PROBLEM_HANDSHAKE_FAILED = 2,
    };
    static void setSessionProblem(SessionProblem problem);
    static SessionProblem getSessionProblem();
    // True once after each reported problem, so the Lite ring flashes once per failed attempt.
    static bool consumeSessionProblemNotice();

private:
    State() = delete;

    static SemaphoreHandle_t state_mutex;

    static esp_ip4_addr_t wifi_ip;
    static bool wifi_connected;
    static std::string wifi_ssid;

    static esp_ip4_addr_t ethernet_ip;
    static bool ethernet_connected;

    static std::string websocket_hostname;
    static NetworkQuality network_quality;
    static uint32_t network_quality_last_inbound_age_ms;
    static uint8_t network_quality_reconnects_last_minute;
    static uint8_t network_quality_tx_queue_depth;
    static uint8_t network_quality_tx_queue_full_events_last_minute;
    static uint8_t network_quality_send_failures_last_minute;
    static uint8_t network_quality_liveness_timeouts_last_minute;
    static uint32_t network_quality_last_pong_rtt_ms;
    static uint32_t network_quality_average_pong_rtt_ms;
    static int32_t network_quality_pong_rtt_trend_ms;
    static uint8_t network_quality_pong_timeouts_last_minute;
    static uint8_t network_quality_pong_probe_loss_percent_last_minute;
    static uint8_t network_quality_missed_heartbeats_last_minute;

    static uint16_t websocket_port;
    static bool websocket_use_ssl;
    static bool websocket_connected;
    static WebsocketPhase websocket_phase;
    static std::string websocket_cert_name;
    static int websocket_cert_index;
    static int websocket_cert_count;
    static int websocket_remembered_retry_count;
    static bool websocket_cert_locked;
    static int websocket_next_attempt_seconds;

    static bool enrollment_pending;
    static bool enrollment_lite;
    static bool enrollment_disconnected;
    static std::string enrollment_code;
    static std::string enrollment_app_url;
    static bool enrollment_has_pattern;
    static uint8_t enrollment_pattern[ENROLLMENT_PATTERN_LENGTH];
    static uint32_t enrollment_received_at;
    static uint32_t enrollment_rotates_in_ms;
    static uint32_t enrollment_expires_in_ms;
    static uint8_t enrollment_outcome;
    static uint8_t enrollment_outcome_unconsumed;
    static bool pairing_removed;
    static SessionProblem session_problem;
    static bool session_problem_notice;
    static uint32_t pairing_removed_at;

    static bool api_authenticated;
    static std::string api_device_name;
};
