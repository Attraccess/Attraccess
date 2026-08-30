// Thread-safe global device state guarded by a FreeRTOS mutex
// FEATURE: Cross-task state synchronization for network and API status

#include "state.hpp"
#include <string>

struct StateLock
{
    StateLock(SemaphoreHandle_t mutex) : handle(mutex)
    {
        if (handle)
        {
            xSemaphoreTakeRecursive(handle, portMAX_DELAY);
        }
    }

    ~StateLock()
    {
        if (handle)
        {
            xSemaphoreGiveRecursive(handle);
        }
    }

    SemaphoreHandle_t handle;
};

SemaphoreHandle_t State::state_mutex = xSemaphoreCreateRecursiveMutex();

esp_ip4_addr_t State::wifi_ip = {};
bool State::wifi_connected = false;
std::string State::wifi_ssid = "";
esp_ip4_addr_t State::ethernet_ip = {};
bool State::ethernet_connected = false;
std::string State::websocket_hostname = "";
State::NetworkQuality State::network_quality = State::NETWORK_QUALITY_OFFLINE;
uint32_t State::network_quality_last_inbound_age_ms = 0;
bool State::network_quality_has_inbound_message = false;
uint8_t State::network_quality_reconnects_last_minute = 0;
uint8_t State::network_quality_tx_queue_depth = 0;
uint8_t State::network_quality_tx_queue_full_events_last_minute = 0;
uint8_t State::network_quality_send_failures_last_minute = 0;
uint8_t State::network_quality_liveness_timeouts_last_minute = 0;
uint32_t State::network_quality_last_pong_rtt_ms = 0;
uint32_t State::network_quality_average_pong_rtt_ms = 0;
int32_t State::network_quality_pong_rtt_trend_ms = 0;
bool State::network_quality_has_pong_rtt_sample = false;
uint8_t State::network_quality_pong_timeouts_last_minute = 0;
uint8_t State::network_quality_pong_probe_loss_percent_last_minute = 0;
bool State::network_quality_has_completed_pong_probe = false;
uint8_t State::network_quality_missed_heartbeats_last_minute = 0;
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
bool State::api_authenticated = false;
std::string State::api_device_name = "";

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

void State::setNetworkQualityState(NetworkQuality quality,
                                   uint32_t lastInboundAgeMs,
                                   bool hasInboundMessage,
                                   uint8_t reconnectsLastMinute,
                                   uint8_t txQueueDepth,
                                   uint8_t txQueueFullEventsLastMinute,
                                   uint8_t sendFailuresLastMinute,
                                   uint8_t livenessTimeoutsLastMinute,
                                   uint32_t lastPongRttMs,
                                   uint32_t averagePongRttMs,
                                   int32_t pongRttTrendMs,
                                   bool hasPongRttSample,
                                   uint8_t pongTimeoutsLastMinute,
                                   uint8_t pongProbeLossPercentLastMinute,
                                   bool hasCompletedPongProbe,
                                   uint8_t missedHeartbeatsLastMinute)
{
    StateLock lock(state_mutex);
    network_quality = quality;
    network_quality_last_inbound_age_ms = lastInboundAgeMs;
    network_quality_has_inbound_message = hasInboundMessage;
    network_quality_reconnects_last_minute = reconnectsLastMinute;
    network_quality_tx_queue_depth = txQueueDepth;
    network_quality_tx_queue_full_events_last_minute = txQueueFullEventsLastMinute;
    network_quality_send_failures_last_minute = sendFailuresLastMinute;
    network_quality_liveness_timeouts_last_minute = livenessTimeoutsLastMinute;
    network_quality_last_pong_rtt_ms = lastPongRttMs;
    network_quality_average_pong_rtt_ms = averagePongRttMs;
    network_quality_pong_rtt_trend_ms = pongRttTrendMs;
    network_quality_has_pong_rtt_sample = hasPongRttSample;
    network_quality_pong_timeouts_last_minute = pongTimeoutsLastMinute;
    network_quality_pong_probe_loss_percent_last_minute = pongProbeLossPercentLastMinute;
    network_quality_has_completed_pong_probe = hasCompletedPongProbe;
    network_quality_missed_heartbeats_last_minute = missedHeartbeatsLastMinute;
}

State::NetworkQualityState State::getNetworkQualityState()
{
    StateLock lock(state_mutex);
    NetworkQualityState state;
    state.quality = network_quality;
    state.lastInboundAgeMs = network_quality_last_inbound_age_ms;
    state.hasInboundMessage = network_quality_has_inbound_message;
    state.reconnectsLastMinute = network_quality_reconnects_last_minute;
    state.txQueueDepth = network_quality_tx_queue_depth;
    state.txQueueFullEventsLastMinute = network_quality_tx_queue_full_events_last_minute;
    state.sendFailuresLastMinute = network_quality_send_failures_last_minute;
    state.livenessTimeoutsLastMinute = network_quality_liveness_timeouts_last_minute;
    state.lastPongRttMs = network_quality_last_pong_rtt_ms;
    state.averagePongRttMs = network_quality_average_pong_rtt_ms;
    state.pongRttTrendMs = network_quality_pong_rtt_trend_ms;
    state.hasPongRttSample = network_quality_has_pong_rtt_sample;
    state.pongTimeoutsLastMinute = network_quality_pong_timeouts_last_minute;
    state.pongProbeLossPercentLastMinute = network_quality_pong_probe_loss_percent_last_minute;
    state.hasCompletedPongProbe = network_quality_has_completed_pong_probe;
    state.missedHeartbeatsLastMinute = network_quality_missed_heartbeats_last_minute;

    return state;
}

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

void State::setApiState(bool authenticated, std::string deviceName)
{
    StateLock lock(state_mutex);
    api_authenticated = authenticated;
    api_device_name = deviceName;
}

State::ApiState State::getApiState()
{
    StateLock lock(state_mutex);
    ApiState state;
    state.authenticated = api_authenticated;
    state.deviceName = api_device_name;

    return state;
}
