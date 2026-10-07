#include "wifi_mac.hpp"
#include "wifi.hpp"
#include "platform.hpp"
#include "esp_log.h"
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

void Wifi::wifiEventHandler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    switch (event_id)
    {
    case WIFI_EVENT_STA_START:
        logger.debug("STA start");
        break;

    case WIFI_EVENT_STA_CONNECTED:
    {
        auto *ev = (wifi_event_sta_connected_t *)event_data;
        std::string ssid(reinterpret_cast<const char *>(ev->ssid), ev->ssid_len);
        logger.infof("Associated with SSID '%s' BSSID %s on channel %d", ssid.c_str(), formatMac(ev->bssid).c_str(), ev->channel);

        if (_state != WIFI_STATE_CONNECTED)
        {
            setState(WIFI_STATE_CONNECTED_WAITING_FOR_IP);
        }
        // Reset reconnection attempts on successful connection
        current_reconnect_attempts_count = 0;
        break;
    }

    case WIFI_EVENT_STA_DISCONNECTED:
    {
        auto *ev = (wifi_event_sta_disconnected_t *)event_data;
        logger.errorf("Disconnected: reason %u (%s)", ev->reason, getDisconnectReasonName(ev->reason));
        setState(WIFI_STATE_DISCONNECTED);
        break;
    }

    case WIFI_EVENT_SCAN_DONE:
        logger.info("Scan completed");
        handleScanComplete();
        break;

    default:
        break;
    }
}

void Wifi::ipEventHandler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;

    char ip[16], mask[16], gw[16];
    snprintf(ip, sizeof(ip), IPSTR, IP2STR(&event->ip_info.ip));
    snprintf(mask, sizeof(mask), IPSTR, IP2STR(&event->ip_info.netmask));
    snprintf(gw, sizeof(gw), IPSTR, IP2STR(&event->ip_info.gw));
    logger.infof("Got IP %s, mask %s, gw %s", ip, mask, gw);

    setState(WIFI_STATE_CONNECTED);
    // Reset reconnection attempts on successful IP acquisition
    current_reconnect_attempts_count = 0;
}

void Wifi::setState(WifiState state)
{
    WifiState previous = _state;
    _state = state;
    if (state == WIFI_STATE_CONNECTED_WAITING_FOR_IP && previous != WIFI_STATE_CONNECTED_WAITING_FOR_IP)
    {
        waiting_for_ip_since_ms = millis();
    }
    State::setWifiState(state == WIFI_STATE_CONNECTED, Wifi::getIPAddress(), _lastSSID);
    if (previous != state)
    {
        logger.infof("State: %s -> %s", getStateName(previous), getStateName(state));
    }
}
