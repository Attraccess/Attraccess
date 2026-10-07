#include "state_lock.hpp"
#include <string>

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
                                   uint8_t missedHeartbeatsLastMinute)
{
    StateLock lock(state_mutex);
    network_quality = quality;
    network_quality_last_inbound_age_ms = lastInboundAgeMs;
    network_quality_reconnects_last_minute = reconnectsLastMinute;
    network_quality_tx_queue_depth = txQueueDepth;
    network_quality_tx_queue_full_events_last_minute = txQueueFullEventsLastMinute;
    network_quality_send_failures_last_minute = sendFailuresLastMinute;
    network_quality_liveness_timeouts_last_minute = livenessTimeoutsLastMinute;
    network_quality_last_pong_rtt_ms = lastPongRttMs;
    network_quality_average_pong_rtt_ms = averagePongRttMs;
    network_quality_pong_rtt_trend_ms = pongRttTrendMs;
    network_quality_pong_timeouts_last_minute = pongTimeoutsLastMinute;
    network_quality_pong_probe_loss_percent_last_minute = pongProbeLossPercentLastMinute;
    network_quality_missed_heartbeats_last_minute = missedHeartbeatsLastMinute;
}

State::NetworkQualityState State::getNetworkQualityState()
{
    StateLock lock(state_mutex);
    NetworkQualityState state;
    state.quality = network_quality;
    state.lastInboundAgeMs = network_quality_last_inbound_age_ms;
    state.reconnectsLastMinute = network_quality_reconnects_last_minute;
    state.txQueueDepth = network_quality_tx_queue_depth;
    state.txQueueFullEventsLastMinute = network_quality_tx_queue_full_events_last_minute;
    state.sendFailuresLastMinute = network_quality_send_failures_last_minute;
    state.livenessTimeoutsLastMinute = network_quality_liveness_timeouts_last_minute;
    state.lastPongRttMs = network_quality_last_pong_rtt_ms;
    state.averagePongRttMs = network_quality_average_pong_rtt_ms;
    state.pongRttTrendMs = network_quality_pong_rtt_trend_ms;
    state.pongTimeoutsLastMinute = network_quality_pong_timeouts_last_minute;
    state.pongProbeLossPercentLastMinute = network_quality_pong_probe_loss_percent_last_minute;
    state.missedHeartbeatsLastMinute = network_quality_missed_heartbeats_last_minute;

    return state;
}
